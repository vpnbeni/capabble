/**
 * Encrypt small secrets at rest (a school's SMTP password) with AES-256-GCM.
 *
 * Key: MAIL_CREDENTIALS_KEY (32 random bytes, base64: `openssl rand -base64 32`).
 * Without it the key is derived from JWT_SECRET so development works; set the
 * real key in production and keep a copy in the password manager. Changing
 * the key makes stored secrets unreadable (schools re-enter their password).
 */
const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';

const keyFor = () => {
  const raw = String(process.env.MAIL_CREDENTIALS_KEY || '').trim();
  if (raw) {
    const key = Buffer.from(raw, 'base64');
    if (key.length !== 32) throw new Error('MAIL_CREDENTIALS_KEY must be 32 bytes, base64 encoded');
    return key;
  }
  const fallback = String(process.env.JWT_SECRET || '').trim();
  if (!fallback) throw new Error('Set MAIL_CREDENTIALS_KEY (or JWT_SECRET) to store mail passwords');
  return crypto.createHash('sha256').update(`capabble:mail-credentials:${fallback}`).digest();
};

/** { iv, tag, data } (base64) for a string. */
const seal = (plain) => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, keyFor(), iv);
  const data = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  return { iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: data.toString('base64') };
};

/** The string back, or null when it can't be opened (wrong key, tampered). */
const open = (box) => {
  if (!box?.iv || !box?.tag || !box?.data) return null;
  try {
    const decipher = crypto.createDecipheriv(ALGORITHM, keyFor(), Buffer.from(box.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(box.tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(box.data, 'base64')), decipher.final()]).toString('utf8');
  } catch (error) {
    return null;
  }
};

module.exports = { seal, open };
