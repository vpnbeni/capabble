/*
 * Wrappers around the database command-line tools (MongoDB Database Tools and the Postgres client),
 * plus temp-folder helpers. Connection strings never go on the command line, where `ps` shows them:
 * mongo tools read the URI from a 0600 config file, pg tools read libpq environment variables.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const config = require('./config');

const makeTempDir = (label) => fs.promises.mkdtemp(path.join(os.tmpdir(), `capabble-${label}-`));
const removeDir = (dir) => (dir ? fs.promises.rm(dir, { recursive: true, force: true }).catch(() => {}) : null);

const run = (command, args, { env } = {}) => new Promise((resolve, reject) => {
  const child = spawn(command, args, { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  let tail = '';
  const keep = (chunk) => { tail = (tail + chunk.toString()).slice(-4000); };
  child.stdout.on('data', keep);
  child.stderr.on('data', keep);
  child.on('error', (error) => reject(error.code === 'ENOENT'
    ? new Error(`${command} is not installed (or set its *_PATH variable).`)
    : error));
  child.on('close', (code) => (code === 0
    ? resolve(tail)
    : reject(new Error(
      `${path.basename(command)} exited with ${code}: ${tail.trim().split('\n').slice(-5).join(' | ')}`
    ))));
});

const mongoUri = () => process.env.MONGODB_URI || process.env.MONGO_URI || process.env.DATABASE_URL
  || 'mongodb://127.0.0.1:27017';

const withMongoConfig = async (uri, fn) => {
  const dir = await makeTempDir('mongo');
  const file = path.join(dir, 'tools.yaml');
  try {
    await fs.promises.writeFile(file, `uri: ${JSON.stringify(uri)}\n`, { mode: 0o600 });
    return await fn(file);
  } finally {
    await removeDir(dir);
  }
};

/** gzip `mongodump --archive` of one database. */
const mongoDump = ({ dbName, file, uri = mongoUri() }) => withMongoConfig(uri, (cfg) => run(
  config.mongodumpPath,
  [`--config=${cfg}`, `--db=${dbName}`, `--archive=${file}`, '--gzip', '--quiet']
));

/**
 * Restores a gzip archive made by mongoDump. `fromDb` is the database name inside the archive;
 * it lands in `toDb`. `drop` replaces collections that already exist (only with an explicit flag).
 */
const mongoRestore = ({ file, fromDb, toDb, drop = false, uri = mongoUri() }) => withMongoConfig(uri, (cfg) => run(
  config.mongorestorePath,
  [
    `--config=${cfg}`, `--archive=${file}`, '--gzip',
    `--nsInclude=${fromDb}.*`, `--nsFrom=${fromDb}.*`, `--nsTo=${toDb}.*`,
    ...(drop ? ['--drop'] : []), '--quiet'
  ]
));

/** libpq environment for a postgres:// URL (sslmode and options kept). */
const pgEnv = (url) => {
  const parsed = new URL(url);
  const env = {
    PGHOST: parsed.hostname,
    PGPORT: parsed.port || '5432',
    PGUSER: decodeURIComponent(parsed.username),
    PGPASSWORD: decodeURIComponent(parsed.password),
    PGDATABASE: decodeURIComponent(parsed.pathname.replace(/^\//, ''))
  };
  const sslmode = parsed.searchParams.get('sslmode');
  if (sslmode) env.PGSSLMODE = sslmode;
  const options = parsed.searchParams.get('options');
  if (options) env.PGOPTIONS = options;
  return env;
};

const pgDump = ({ url, file }) => run(
  config.pgDumpPath,
  ['--format=custom', '--no-owner', '--no-privileges', `--file=${file}`],
  { env: pgEnv(url) }
);

const pgRestore = ({ url, file, clean = false }) => {
  const env = pgEnv(url);
  // Without --dbname pg_restore prints SQL instead of restoring. The name alone; the rest is in env.
  return run(
    config.pgRestorePath,
    [`--dbname=${env.PGDATABASE}`, '--no-owner', '--no-privileges', '--exit-on-error',
      ...(clean ? ['--clean', '--if-exists'] : []), file],
    { env }
  );
};

module.exports = { makeTempDir, removeDir, run, mongoUri, mongoDump, mongoRestore, pgDump, pgRestore, pgEnv };
