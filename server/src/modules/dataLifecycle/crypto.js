/*
 * File encryption for backups: AES-256-GCM, streamed.
 *
 *   [magic "CBBK1" 5 bytes][key id 8 bytes][iv 12 bytes][ciphertext …][auth tag 16 bytes]
 *
 * The key id is the first 8 bytes of sha256(key), so a restore with the wrong key says so
 * instead of failing with a bare auth error. The tag sits at the end, so decryption reads it
 * first (files are always on disk when decrypted).
 */
const crypto = require('crypto');
const fs = require('fs');
const { pipeline } = require('stream/promises');

const MAGIC = Buffer.from('CBBK1');
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_ID_BYTES = 8;
const HEADER_BYTES = MAGIC.length + KEY_ID_BYTES + IV_BYTES;

const parseKey = (value) => {
  const key = Buffer.from(String(value || ''), 'base64');
  if (key.length !== 32) {
    throw new Error('BACKUP_ENCRYPTION_KEY must be 32 random bytes in base64 (openssl rand -base64 32).');
  }
  return key;
};

const keyId = (key) => crypto.createHash('sha256').update(key).digest().subarray(0, KEY_ID_BYTES);

const encryptFile = async (source, target, keyValue) => {
  const key = parseKey(keyValue);
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const out = fs.createWriteStream(target, { mode: 0o600 });
  out.write(Buffer.concat([MAGIC, keyId(key), iv]));
  await pipeline(fs.createReadStream(source), cipher, out, { end: false });
  await new Promise((resolve, reject) => {
    out.end(cipher.getAuthTag(), (error) => (error ? reject(error) : resolve()));
  });
};

const readRange = async (file, start, length) => {
  const handle = await fs.promises.open(file, 'r');
  try {
    const buffer = Buffer.alloc(length);
    await handle.read(buffer, 0, length, start);
    return buffer;
  } finally {
    await handle.close();
  }
};

const decryptFile = async (source, target, keyValue) => {
  const key = parseKey(keyValue);
  const { size } = await fs.promises.stat(source);
  if (size < HEADER_BYTES + TAG_BYTES) throw new Error('Not a Capabble backup file (too short).');
  const header = await readRange(source, 0, HEADER_BYTES);
  if (!header.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error('Not a Capabble backup file.');
  const fileKeyId = header.subarray(MAGIC.length, MAGIC.length + KEY_ID_BYTES);
  if (!fileKeyId.equals(keyId(key))) {
    throw new Error('This backup was encrypted with a different key than BACKUP_ENCRYPTION_KEY.');
  }
  const iv = header.subarray(MAGIC.length + KEY_ID_BYTES);
  const tag = await readRange(source, size - TAG_BYTES, TAG_BYTES);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  await pipeline(
    fs.createReadStream(source, { start: HEADER_BYTES, end: size - TAG_BYTES - 1 }),
    decipher,
    fs.createWriteStream(target, { mode: 0o600 })
  );
};

const sha256File = async (file) => {
  const hash = crypto.createHash('sha256');
  await pipeline(fs.createReadStream(file), hash);
  return hash.digest('hex');
};

module.exports = { encryptFile, decryptFile, sha256File, parseKey, MAGIC };
