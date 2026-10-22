/*
 * The workspace archive a school downloads (and we can re-import): a .zip holding
 *
 *   manifest.json          what this is: format version, app version, school details, counts, checksums
 *   database.archive.gz    gzip `mongodump --archive` of the school's database
 *   files/manifest.json    every uploaded file: its original URL, and its path in the zip if included
 *   files/<type>/<id>      the files themselves (left out above ARCHIVE_MAX_FILES_MB; then links only)
 *   README.txt             a plain explanation for the school
 *
 * Bump FORMAT_VERSION when the layout changes and teach upgradeManifest the old one, so archives
 * schools kept from older versions still import.
 */
const FORMAT = 'capabble-workspace-archive';
const FORMAT_VERSION = 1;
const SUPPORTED_VERSIONS = [1];

const buildManifest = ({ tenant, app, createdAt = new Date(), database, files, checksums }) => ({
  format: FORMAT,
  formatVersion: FORMAT_VERSION,
  createdAt: new Date(createdAt).toISOString(),
  app: { version: app?.version || '', commit: app?.commit || '' },
  tenant: {
    slug: tenant.slug,
    name: tenant.name,
    dbName: tenant.dbName,
    adminEmail: tenant.adminEmail || '',
    createdAt: tenant.createdAt ? new Date(tenant.createdAt).toISOString() : null,
    institution: {
      schoolCode: tenant.metadata?.schoolCode || '',
      affiliationNo: tenant.metadata?.affiliationNo || '',
      udiseCode: tenant.metadata?.udiseCode || ''
    },
    featureToggles: tenant.featureToggles || {}
  },
  database: {
    file: 'database.archive.gz',
    name: database.name,
    collections: database.collections,
    documents: Object.values(database.collections).reduce((sum, n) => sum + n, 0)
  },
  files: {
    manifest: 'files/manifest.json',
    mode: files.mode,
    count: files.count,
    included: files.included,
    bytes: files.bytes,
    cloudName: files.cloudName || ''
  },
  checksums: checksums || {}
});

/** Older manifests → the current shape. Each step handles one version. */
const UPGRADES = {
  // 1: current.
};

const upgradeManifest = (manifest) => {
  let current = manifest;
  while (current.formatVersion < FORMAT_VERSION && UPGRADES[current.formatVersion]) {
    current = UPGRADES[current.formatVersion](current);
  }
  return current;
};

/** Checks an archive's manifest before import. */
const validateManifest = (manifest) => {
  const errors = [];
  const warnings = [];
  if (!manifest || typeof manifest !== 'object') {
    return { ok: false, errors: ['manifest.json is missing or not JSON.'], warnings };
  }
  if (manifest.format !== FORMAT) errors.push('This is not a Capabble workspace archive.');
  const version = Number(manifest.formatVersion);
  if (!SUPPORTED_VERSIONS.includes(version)) {
    errors.push(version > FORMAT_VERSION
      ? `Archive format ${version} is newer than this server understands (${FORMAT_VERSION}). Update the server first.`
      : `Archive format ${version} is not supported.`);
  }
  if (!manifest.tenant?.slug) errors.push('The archive does not name its workspace.');
  if (!manifest.database?.name || !manifest.database?.file) errors.push('The archive has no database dump.');
  if (manifest.files?.mode === 'links' || manifest.files?.mode === 'partial') {
    warnings.push('Some uploaded files are links only. They come back only if they still exist on Cloudinary.');
  }
  return { ok: errors.length === 0, errors, warnings };
};

const archiveReadme = (manifest) => [
  `Capabble workspace archive: ${manifest.tenant.name} (${manifest.tenant.slug})`,
  `Made on ${manifest.createdAt}.`,
  '',
  'Keep this file somewhere safe. It holds all of your school\'s data in Capabble.',
  'If your school comes back to Capabble, write to support@capabble.cloud and we can',
  'bring your workspace back from this file, with all its records and uploaded files.',
  '',
  'What is inside:',
  '  database.archive.gz  your records (a MongoDB archive; open it with mongorestore)',
  '  files/               photos, signatures and documents you uploaded',
  '  files/manifest.json  where each file came from',
  '  manifest.json        details of this archive',
  ''
].join('\r\n');

module.exports = {
  FORMAT, FORMAT_VERSION, SUPPORTED_VERSIONS, buildManifest, validateManifest, upgradeManifest, archiveReadme
};
