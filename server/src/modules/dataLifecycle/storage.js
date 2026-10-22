/*
 * Object storage for backups, workspace archives and uploaded archives for re-import.
 *
 * Two drivers with the same methods:
 *   s3    — AWS S3 (ap-south-1) or any S3-compatible store via BACKUP_S3_ENDPOINT. Credentials come
 *           from the usual AWS chain (EC2 instance role first; AWS_ACCESS_KEY_ID/SECRET otherwise).
 *   local — a folder (BACKUP_LOCAL_DIR). For dev and tests; it emulates the expiry rules itself.
 *
 * Keys are relative to the environment prefix (config.prefix): `backups/…`, `archives/…`, `imports/…`.
 */
const fs = require('fs');
const path = require('path');
const { pipeline } = require('stream/promises');
const config = require('./config');

// Expiry, in days, for each area. The S3 driver turns these into bucket lifecycle rules.
const RETENTION_DAYS = {
  backups: 30,
  // Safety net only: a purge deletes the school's archives itself. Longer than closing + 90 days.
  archives: 100,
  imports: 7
};

const fullKey = (key) => `${config.prefix}/${String(key).replace(/^\/+/, '')}`;
const assertKey = (key) => {
  if (!key || /(^|\/)\.\.(\/|$)/.test(key) || key.startsWith('/')) throw new Error(`Invalid storage key: ${key}`);
  return key;
};

/* ------------------------------------------------------------------ local */

const localDriver = () => {
  const root = config.localDir;
  if (!root) throw new Error('BACKUP_LOCAL_DIR is required when BACKUP_STORAGE=local.');
  const fileOf = (key) => path.join(root, fullKey(assertKey(key)));

  const walk = async (dir) => {
    const entries = await fs.promises.readdir(dir, { withFileTypes: true }).catch(() => []);
    const nested = await Promise.all(entries.map(async (entry) => {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) return walk(file);
      const stat = await fs.promises.stat(file);
      return [{ file, size: stat.size, lastModified: stat.mtime }];
    }));
    return nested.flat();
  };

  return {
    name: 'local',
    async putFile(key, file) {
      const target = fileOf(key);
      await fs.promises.mkdir(path.dirname(target), { recursive: true });
      await fs.promises.copyFile(file, target);
    },
    async putStream(key, stream) {
      const target = fileOf(key);
      await fs.promises.mkdir(path.dirname(target), { recursive: true });
      await pipeline(stream, fs.createWriteStream(target));
    },
    async getFile(key, file) {
      await fs.promises.copyFile(fileOf(key), file);
    },
    async readStream(key) {
      return fs.createReadStream(fileOf(key));
    },
    async head(key) {
      const stat = await fs.promises.stat(fileOf(key)).catch(() => null);
      return stat ? { size: stat.size, lastModified: stat.mtime } : null;
    },
    async list(prefix) {
      const base = path.join(root, config.prefix);
      const files = await walk(path.join(base, assertKey(prefix)));
      return files
        .map(({ file, size, lastModified }) => ({
          key: path.relative(base, file).split(path.sep).join('/'), size, lastModified
        }))
        .sort((a, b) => a.key.localeCompare(b.key));
    },
    async remove(key) {
      await fs.promises.rm(fileOf(key), { force: true });
    },
    // Local files have no public URL; the server streams them (see archive download routes).
    async downloadUrl() { return null; },
    async uploadUrl() { return null; },
    async applyRetention(now = new Date()) {
      const removed = [];
      await Promise.all(Object.entries(RETENTION_DAYS).map(async ([area, days]) => {
        const cutoff = now.getTime() - days * 86400000;
        const files = await this.list(area);
        await Promise.all(files.filter((f) => f.lastModified.getTime() < cutoff).map(async (f) => {
          await this.remove(f.key);
          removed.push(f.key);
        }));
      }));
      return { removed };
    },
    async describeRetention() {
      return Object.entries(RETENTION_DAYS).map(([area, days]) => ({ prefix: `${config.prefix}/${area}/`, days }));
    }
  };
};

/* ------------------------------------------------------------------ s3 */

let s3Client = null;
const s3Driver = () => {
  /* eslint-disable global-require */
  const {
    S3Client, GetObjectCommand, HeadObjectCommand, ListObjectsV2Command, DeleteObjectCommand,
    PutObjectCommand, PutBucketLifecycleConfigurationCommand, GetBucketLifecycleConfigurationCommand
  } = require('@aws-sdk/client-s3');
  const { Upload } = require('@aws-sdk/lib-storage');
  const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
  /* eslint-enable global-require */

  const Bucket = config.s3Bucket;
  if (!Bucket) throw new Error('BACKUP_S3_BUCKET is required when BACKUP_STORAGE=s3.');
  if (!s3Client) {
    s3Client = new S3Client({
      region: config.s3Region,
      ...(config.s3Endpoint ? { endpoint: config.s3Endpoint, forcePathStyle: true } : {})
    });
  }
  const client = s3Client;

  const upload = (key, Body, contentType) => new Upload({
    client,
    params: {
      Bucket,
      Key: fullKey(assertKey(key)),
      Body,
      ContentType: contentType || 'application/octet-stream',
      // Encrypted at rest by S3 as well as by us (backups) — free, and the default for new buckets.
      ServerSideEncryption: 'AES256'
    }
  }).done();

  return {
    name: 's3',
    async putFile(key, file, { contentType } = {}) {
      await upload(key, fs.createReadStream(file), contentType);
    },
    async putStream(key, stream, { contentType } = {}) {
      await upload(key, stream, contentType);
    },
    async getFile(key, file) {
      const { Body } = await client.send(new GetObjectCommand({ Bucket, Key: fullKey(assertKey(key)) }));
      await pipeline(Body, fs.createWriteStream(file));
    },
    async readStream(key) {
      const { Body } = await client.send(new GetObjectCommand({ Bucket, Key: fullKey(assertKey(key)) }));
      return Body;
    },
    async head(key) {
      try {
        const out = await client.send(new HeadObjectCommand({ Bucket, Key: fullKey(assertKey(key)) }));
        return { size: out.ContentLength, lastModified: out.LastModified };
      } catch (error) {
        if (error?.$metadata?.httpStatusCode === 404 || error?.name === 'NotFound') return null;
        throw error;
      }
    },
    async list(prefix) {
      const items = [];
      let ContinuationToken;
      const base = `${config.prefix}/`;
      do {
        // eslint-disable-next-line no-await-in-loop
        const out = await client.send(new ListObjectsV2Command({
          Bucket, Prefix: fullKey(assertKey(prefix)), ContinuationToken
        }));
        (out.Contents || []).forEach((item) => items.push({
          key: item.Key.slice(base.length), size: item.Size, lastModified: item.LastModified
        }));
        ContinuationToken = out.IsTruncated ? out.NextContinuationToken : undefined;
      } while (ContinuationToken);
      return items.sort((a, b) => a.key.localeCompare(b.key));
    },
    async remove(key) {
      await client.send(new DeleteObjectCommand({ Bucket, Key: fullKey(assertKey(key)) }));
    },
    async downloadUrl(key, { seconds = 300, filename } = {}) {
      return getSignedUrl(client, new GetObjectCommand({
        Bucket,
        Key: fullKey(assertKey(key)),
        ...(filename ? { ResponseContentDisposition: `attachment; filename="${filename}"` } : {})
      }), { expiresIn: seconds });
    },
    async uploadUrl(key, { seconds = 3600, contentType = 'application/zip' } = {}) {
      const url = await getSignedUrl(client, new PutObjectCommand({
        Bucket, Key: fullKey(assertKey(key)), ContentType: contentType
      }), { expiresIn: seconds });
      return { url, method: 'PUT', headers: { 'Content-Type': contentType } };
    },
    // S3 expires objects itself; this only installs (or checks) the bucket rules.
    async applyRetention() { return { removed: [] }; },
    async installRetention() {
      const Rules = Object.entries(RETENTION_DAYS).map(([area, days]) => ({
        ID: `${config.prefix}-${area}-${days}d`,
        Status: 'Enabled',
        Filter: { Prefix: `${config.prefix}/${area}/` },
        Expiration: { Days: days },
        AbortIncompleteMultipartUpload: { DaysAfterInitiation: 1 }
      }));
      // Keep rules for other prefixes (another environment sharing the bucket).
      let existing = [];
      try {
        existing = (await client.send(new GetBucketLifecycleConfigurationCommand({ Bucket }))).Rules || [];
      } catch (error) {
        if (error?.name !== 'NoSuchLifecycleConfiguration') throw error;
      }
      const ours = new Set(Rules.map((rule) => rule.Filter.Prefix));
      const kept = existing.filter((rule) => !ours.has(rule.Filter?.Prefix ?? rule.Prefix));
      await client.send(new PutBucketLifecycleConfigurationCommand({
        Bucket, LifecycleConfiguration: { Rules: [...kept, ...Rules] }
      }));
      return Rules;
    },
    async describeRetention() {
      try {
        const out = await client.send(new GetBucketLifecycleConfigurationCommand({ Bucket }));
        return (out.Rules || [])
          .filter((rule) => (rule.Filter?.Prefix || '').startsWith(`${config.prefix}/`))
          .map((rule) => ({ prefix: rule.Filter.Prefix, days: rule.Expiration?.Days, status: rule.Status }));
      } catch (error) {
        if (error?.name === 'NoSuchLifecycleConfiguration') return [];
        throw error;
      }
    }
  };
};

const getStorage = () => {
  if (config.storageDriver === 'local') return localDriver();
  if (config.storageDriver === 's3') return s3Driver();
  throw new Error(`Unknown BACKUP_STORAGE "${config.storageDriver}" (use s3 or local).`);
};

const isStorageConfigured = () => {
  if (config.storageDriver === 'local') return Boolean(config.localDir);
  if (config.storageDriver === 's3') return Boolean(config.s3Bucket);
  return false;
};

module.exports = { getStorage, isStorageConfigured, RETENTION_DAYS };
