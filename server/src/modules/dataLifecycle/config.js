// Backups, workspace archives and purges: runtime settings read from the environment, in one place.
const { getCentralDbName } = require('../../config/platformDatabase');

const str = (name, fallback = '') => String(process.env[name] ?? fallback).trim();
const int = (name, fallback) => {
  const value = Number.parseInt(process.env[name] || '', 10);
  return Number.isFinite(value) ? value : fallback;
};
const bool = (name, fallback = false) => {
  const value = str(name).toLowerCase();
  if (!value) return fallback;
  return value === 'true' || value === '1';
};

const config = {
  // Nightly backup of every database. Off unless asked for, so dev machines never run it.
  get backupsEnabled() { return bool('BACKUP_ENABLED'); },
  // Daily workspace job: archives, closing notices and purge requests.
  get lifecycleEnabled() { return bool('WORKSPACE_LIFECYCLE_ENABLED'); },
  // Hour of the day (IST) after which the nightly backup runs.
  get backupHourIst() { return int('BACKUP_HOUR_IST', 2); },
  get timezone() { return 'Asia/Kolkata'; },

  // 's3' (AWS S3 or any S3-compatible store) or 'local' (a folder; dev and tests only).
  get storageDriver() { return str('BACKUP_STORAGE', 's3').toLowerCase(); },
  get s3Bucket() { return str('BACKUP_S3_BUCKET'); },
  get s3Region() { return str('BACKUP_S3_REGION', 'ap-south-1'); },
  get s3Endpoint() { return str('BACKUP_S3_ENDPOINT'); },
  get localDir() { return str('BACKUP_LOCAL_DIR'); },
  // Everything this environment writes sits under one prefix, so stage and production can share
  // a bucket without seeing each other's files. Defaults to the central database name.
  get prefix() { return str('BACKUP_PREFIX', getCentralDbName()).replace(/^\/+|\/+$/g, ''); },

  // 32 random bytes, base64. Never stored next to the backups (see the runbook).
  get encryptionKey() { return str('BACKUP_ENCRYPTION_KEY'); },

  get mongodumpPath() { return str('MONGODUMP_PATH', 'mongodump'); },
  get mongorestorePath() { return str('MONGORESTORE_PATH', 'mongorestore'); },
  get pgDumpPath() { return str('PG_DUMP_PATH', 'pg_dump'); },
  get pgRestorePath() { return str('PG_RESTORE_PATH', 'pg_restore'); },
  // Neon's free plan keeps only hours of history, so billing is dumped too unless switched off.
  get backupBilling() { return bool('BACKUP_BILLING', true) && Boolean(str('BILLING_DATABASE_URL')); },

  // Signed links in archive emails.
  get linkSecret() { return str('ARCHIVE_LINK_SECRET') || str('JWT_SECRET'); },
  get linkDays() { return int('ARCHIVE_LINK_DAYS', 7); },
  get apiUrl() {
    return str('API_URL', `http://localhost:${process.env.PORT || 5000}/api`).replace(/\/+$/, '');
  },
  get appUrl() { return str('CLIENT_URL', 'https://school.capabble.cloud').replace(/\/+$/, ''); },
  // Above this many megabytes of uploaded files, the archive lists links instead of the files.
  get archiveMaxFilesMb() { return int('ARCHIVE_MAX_FILES_MB', 500); },

  get supportEmail() { return str('SUPPORT_EMAIL', 'support@capabble.cloud'); },
  // Lets the lifecycle CLI pretend it is a later date (testing a purge). Never set in production.
  get clockOverrideAllowed() { return bool('WORKSPACE_CLOCK_OVERRIDE_ALLOWED'); }
};

module.exports = config;
