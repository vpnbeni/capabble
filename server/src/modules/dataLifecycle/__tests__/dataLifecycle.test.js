const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const { selectDue, selectToClose, selectDeletionNotices } = require('../purgeService');
const { buildManifest, validateManifest, FORMAT, FORMAT_VERSION } = require('../archiveFormat');
const { checkRestoreTarget, sameMongoCluster, samePostgres } = require('../restoreService');
const { encryptFile, decryptFile } = require('../crypto');
const { parseCloudinaryUrl, eachString } = require('../cloudinaryFiles');
const { decideTarget, safeEntryPath } = require('../importService');
const { statusOf, runIdFor } = require('../backupService');

const DAY = 86400000;
const NOW = new Date('2027-01-20T03:00:00Z');
const daysFromNow = (n) => new Date(NOW.getTime() + n * DAY);

const closing = (overrides = {}, closure = {}) => ({
  _id: overrides.slug || 'x',
  slug: 'x',
  status: 'active',
  ...overrides,
  closure: {
    requestedAt: daysFromNow(-90),
    exportUntil: daysFromNow(-60),
    deleteAfter: daysFromNow(-1),
    canceledAt: null,
    deletionNoticeSentAt: null,
    ...closure
  }
});

describe('purge selection', () => {
  test('due when the deletion date has passed and the closure stands', () => {
    const due = closing({ slug: 'due' });
    const exactlyNow = closing({ slug: 'now' }, { deleteAfter: NOW });
    expect(selectDue([due, exactlyNow], NOW).map((t) => t.slug)).toEqual(['due', 'now']);
  });

  test('not due: cancelled, already deleted, date ahead, or never requested', () => {
    const tenants = [
      closing({ slug: 'canceled' }, { canceledAt: daysFromNow(-80) }),
      closing({ slug: 'deleted', status: 'deleted' }),
      closing({ slug: 'future' }, { deleteAfter: daysFromNow(1) }),
      { slug: 'none', status: 'active', closure: null },
      { slug: 'blank', status: 'active', closure: { requestedAt: null } }
    ];
    expect(selectDue(tenants, NOW)).toEqual([]);
  });

  test('closed tenants are still purged when due', () => {
    expect(selectDue([closing({ slug: 'c', status: 'closed' })], NOW)).toHaveLength(1);
  });

  test('closing after the export window, once', () => {
    const open = closing({ slug: 'open' }, { exportUntil: daysFromNow(2), deleteAfter: daysFromNow(62) });
    const over = closing({ slug: 'over' }, { exportUntil: daysFromNow(-1), deleteAfter: daysFromNow(59) });
    const already = closing({ slug: 'already', status: 'closed' });
    const canceled = closing({ slug: 'canceled' }, { canceledAt: daysFromNow(-70) });
    expect(selectToClose([open, over, already, canceled], NOW).map((t) => t.slug)).toEqual(['over']);
  });

  test('deletion notice 7 days ahead, once', () => {
    const inSix = closing({ slug: 'six' }, { deleteAfter: daysFromNow(6) });
    const inSeven = closing({ slug: 'seven' }, { deleteAfter: daysFromNow(7) });
    const inEight = closing({ slug: 'eight' }, { deleteAfter: daysFromNow(8) });
    const told = closing({ slug: 'told' }, { deleteAfter: daysFromNow(3), deletionNoticeSentAt: daysFromNow(-4) });
    const past = closing({ slug: 'past' }, { deleteAfter: daysFromNow(-1) });
    expect(selectDeletionNotices([inSix, inSeven, inEight, told, past], NOW).map((t) => t.slug))
      .toEqual(['six', 'seven']);
  });
});

describe('workspace archive manifest', () => {
  const tenant = {
    slug: 'redrose',
    name: 'Red Rose School',
    dbName: 'capabble_tenant_redrose',
    adminEmail: 'principal@redrose.test',
    createdAt: new Date('2025-04-01T00:00:00Z'),
    metadata: { schoolCode: '12345', affiliationNo: 'A1', udiseCode: 'U9' },
    featureToggles: { stdnt: true }
  };
  const manifest = buildManifest({
    tenant,
    app: { version: '1.0.0', commit: 'abc123' },
    createdAt: new Date('2026-10-22T00:00:00Z'),
    database: { name: tenant.dbName, collections: { students: 10, users: 2 } },
    files: { mode: 'included', count: 3, included: 3, bytes: 900, cloudName: 'demo' },
    checksums: { 'database.archive.gz': 'deadbeef' }
  });

  test('records format, app version, school and counts', () => {
    expect(manifest).toMatchObject({
      format: FORMAT,
      formatVersion: FORMAT_VERSION,
      createdAt: '2026-10-22T00:00:00.000Z',
      app: { version: '1.0.0', commit: 'abc123' },
      tenant: {
        slug: 'redrose',
        name: 'Red Rose School',
        createdAt: '2025-04-01T00:00:00.000Z',
        institution: { schoolCode: '12345', affiliationNo: 'A1', udiseCode: 'U9' }
      },
      database: { file: 'database.archive.gz', name: 'capabble_tenant_redrose', documents: 12 },
      files: { mode: 'included', count: 3, cloudName: 'demo' },
      checksums: { 'database.archive.gz': 'deadbeef' }
    });
  });

  test('a fresh manifest validates', () => {
    expect(validateManifest(manifest)).toEqual({ ok: true, errors: [], warnings: [] });
  });

  test('rejects other files, newer formats and missing parts', () => {
    expect(validateManifest(null).ok).toBe(false);
    expect(validateManifest({ ...manifest, format: 'zip' }).errors[0]).toMatch(/not a Capabble/);
    expect(validateManifest({ ...manifest, formatVersion: FORMAT_VERSION + 1 }).errors[0]).toMatch(/newer/);
    expect(validateManifest({ ...manifest, database: {} }).ok).toBe(false);
  });

  test('warns when files are links only', () => {
    const links = { ...manifest, files: { ...manifest.files, mode: 'links' } };
    expect(validateManifest(links)).toMatchObject({ ok: true, warnings: [expect.stringMatching(/links only/)] });
  });
});

describe('restore safety', () => {
  const live = ['capabble_central', 'capabble_tenant_a'];

  test('refuses a live database without the flag', () => {
    expect(checkRestoreTarget({ target: 'capabble_tenant_a', liveNames: live, targetHasData: true }))
      .toMatchObject({ ok: false, reason: expect.stringMatching(/--overwrite-live/) });
    expect(checkRestoreTarget({ target: 'capabble_central', liveNames: live }).ok).toBe(false);
  });

  test('refuses a non-empty scratch database without the flag', () => {
    expect(checkRestoreTarget({ target: 'scratch', liveNames: live, targetHasData: true }))
      .toMatchObject({ ok: false, reason: expect.stringMatching(/already has data/) });
  });

  test('allows an empty, non-live target without dropping anything', () => {
    expect(checkRestoreTarget({ target: 'scratch', liveNames: live })).toEqual({ ok: true, drop: false });
  });

  test('the flag allows replacing, and only then drops', () => {
    expect(checkRestoreTarget({ target: 'capabble_tenant_a', liveNames: live, targetHasData: true, allowLive: true }))
      .toEqual({ ok: true, drop: true });
  });

  test('needs a target', () => {
    expect(checkRestoreTarget({ target: '' }).ok).toBe(false);
  });

  test('cluster and database matching', () => {
    expect(sameMongoCluster('mongodb+srv://u:p@a.example.net/?x=1', 'mongodb+srv://v:q@A.example.net')).toBe(true);
    expect(sameMongoCluster('mongodb://127.0.0.1:27017', 'mongodb://127.0.0.1:27018')).toBe(false);
    expect(samePostgres('postgres://u:p@h:5432/billing', 'postgres://x:y@h/billing')).toBe(true);
    expect(samePostgres('postgres://u:p@h/billing', 'postgres://u:p@h/restore')).toBe(false);
  });
});

describe('backup encryption', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'capabble-crypto-test-'));
  const key = crypto.randomBytes(32).toString('base64');
  const plain = path.join(dir, 'plain.bin');
  const sealed = path.join(dir, 'sealed.enc');
  const back = path.join(dir, 'back.bin');
  const data = crypto.randomBytes(200000);
  fs.writeFileSync(plain, data);

  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  test('round trip, and the ciphertext does not contain the data', async () => {
    await encryptFile(plain, sealed, key);
    const enc = fs.readFileSync(sealed);
    expect(enc.subarray(0, 5).toString()).toBe('CBBK1');
    expect(enc.includes(data.subarray(1000, 1064))).toBe(false);
    await decryptFile(sealed, back, key);
    expect(fs.readFileSync(back).equals(data)).toBe(true);
  });

  test('wrong key and tampering are detected', async () => {
    await encryptFile(plain, sealed, key);
    await expect(decryptFile(sealed, back, crypto.randomBytes(32).toString('base64'))).rejects.toThrow(/different key/);
    const enc = fs.readFileSync(sealed);
    enc[100] = 255 - enc[100];
    fs.writeFileSync(sealed, enc);
    await expect(decryptFile(sealed, back, key)).rejects.toThrow();
  });

  test('rejects a key that is not 32 bytes', async () => {
    await expect(encryptFile(plain, sealed, 'short')).rejects.toThrow(/32 random bytes/);
  });
});

describe('cloudinary urls', () => {
  test('image, raw and transformed urls', () => {
    expect(parseCloudinaryUrl('https://res.cloudinary.com/demo/image/upload/v1712/capabble/school-logos/abc.png'))
      .toMatchObject({
        cloudName: 'demo',
        resourceType: 'image',
        type: 'upload',
        version: '1712',
        publicId: 'capabble/school-logos/abc',
        format: 'png'
      });
    expect(parseCloudinaryUrl('https://res.cloudinary.com/demo/raw/upload/v1/cpitl/x/bill.pdf'))
      .toMatchObject({ resourceType: 'raw', publicId: 'cpitl/x/bill.pdf' });
    expect(parseCloudinaryUrl('https://res.cloudinary.com/demo/image/upload/c_fill,w_100/photo.jpg'))
      .toMatchObject({ publicId: 'photo', version: null });
    expect(parseCloudinaryUrl('https://example.com/image/upload/v1/a.png')).toBeNull();
  });

  test('finds strings deep inside documents', () => {
    const seen = [];
    eachString({ a: ['x', { b: 'y' }], c: 3, d: new Date() }, (s) => seen.push(s));
    expect(seen).toEqual(['x', 'y']);
  });
});

describe('re-import target', () => {
  test('creates when the workspace code is free', () => {
    expect(decideTarget({ slug: 'redrose', existing: null, dbEmpty: true })).toMatchObject({ action: 'create' });
  });

  test('reuses a workspace whose database is empty (e.g. after a purge)', () => {
    expect(decideTarget({ slug: 'redrose', existing: { _id: 1, status: 'deleted', dbName: 'db' }, dbEmpty: true }))
      .toMatchObject({ action: 'reuse', dbName: 'db', currentStatus: 'deleted' });
  });

  test('never imports over data', () => {
    expect(decideTarget({ slug: 'redrose', existing: { status: 'active', dbName: 'db' }, dbEmpty: false }).error)
      .toMatch(/already has data/);
    expect(decideTarget({ slug: 'Bad Slug!', existing: null, dbEmpty: true }).error).toMatch(/not a valid/);
  });

  test('zip entries cannot escape the folder', () => {
    expect(safeEntryPath('files/image/upload/a.png')).toBe(true);
    expect(safeEntryPath('../etc/passwd')).toBe(false);
    expect(safeEntryPath('/abs')).toBe(false);
    expect(safeEntryPath('files/../../x')).toBe(false);
  });
});

describe('backup runs', () => {
  test('status from file results', () => {
    expect(statusOf([{ ok: true }, { ok: true }])).toBe('ok');
    expect(statusOf([{ ok: true }, { ok: false }])).toBe('partial');
    expect(statusOf([{ ok: false }])).toBe('failed');
  });

  test('run ids sort by IST time', () => {
    expect(runIdFor(new Date('2026-10-21T20:45:00Z'))).toMatch(/^2026-10-22T0215-[0-9a-f]{4}$/);
  });
});
