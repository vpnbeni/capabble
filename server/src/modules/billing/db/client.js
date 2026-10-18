// Postgres access for the billing module. Only this module touches the billing database.
const { Pool } = require('pg');
const { drizzle } = require('drizzle-orm/node-postgres');
const { sql } = require('drizzle-orm');
const schema = require('./schema');
const { connectionOptions } = require('./ssl');

let pool = null;
let db = null;

// Errors worth retrying: Neon waking from scale-to-zero, dropped connections, lock conflicts.
const TRANSIENT_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'EPIPE',
  'ENOTFOUND',
  'EAI_AGAIN',
  '57P01', // admin_shutdown (compute suspended)
  '57P02', // crash_shutdown
  '57P03', // cannot_connect_now (compute starting)
  '08000', // connection_exception
  '08001',
  '08003',
  '08006',
  '40001', // serialization_failure
  '40P01' // deadlock_detected
]);

function isTransientError(error) {
  if (!error) return false;
  if (TRANSIENT_CODES.has(error.code)) return true;
  const message = String(error.message || '');
  return /timeout|terminated unexpectedly|Connection terminated|connect ECONN|socket hang up/i.test(message);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function withRetry(fn, { attempts = 3, baseDelayMs = 400, label = 'db' } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (!isTransientError(error) || attempt === attempts) throw error;
      const delay = baseDelayMs * 2 ** (attempt - 1);
      console.warn(`[billing] ${label} transient error (${error.code || error.message}); retry ${attempt}/${attempts - 1} in ${delay}ms`);
      await sleep(delay);
    }
  }
  throw lastError;
}

function createPool() {
  const connectionString = process.env.BILLING_DATABASE_URL;
  if (!connectionString) {
    throw new Error('BILLING_DATABASE_URL is not set (use the pooled Neon connection string)');
  }
  const created = new Pool({
    ...connectionOptions(connectionString),
    max: Number.parseInt(process.env.BILLING_DATABASE_POOL_MAX || '10', 10),
    // Neon can take a few seconds to wake a suspended compute.
    connectionTimeoutMillis: Number.parseInt(process.env.BILLING_DATABASE_CONNECT_TIMEOUT_MS || '10000', 10),
    idleTimeoutMillis: 30000,
    statement_timeout: Number.parseInt(process.env.BILLING_DATABASE_STATEMENT_TIMEOUT_MS || '15000', 10)
  });
  // An idle client dropped by Neon must not crash the process.
  created.on('error', (error) => {
    console.warn('[billing] idle Postgres client error', error.code || error.message);
  });
  return created;
}

// True when a billing database is set (or a test database was swapped in).
const isConfigured = () => Boolean(db || process.env.BILLING_DATABASE_URL);

function getDb() {
  if (!db) {
    pool = createPool();
    db = drizzle(pool, { schema });
  }
  return db;
}

// Tests swap in a PGlite-backed Drizzle instance.
function setDb(instance) {
  db = instance;
}

/**
 * Run fn(tx) in one transaction. The whole transaction is retried on transient
 * errors; individual statements inside it are never retried on their own.
 */
function transaction(fn, options = {}) {
  return withRetry(() => getDb().transaction(fn), { label: 'transaction', ...options });
}

async function ping() {
  const started = Date.now();
  await withRetry(() => getDb().execute(sql`select 1`), { label: 'ping', attempts: 4 });
  return Date.now() - started;
}

async function closeDb() {
  if (pool) await pool.end();
  pool = null;
  db = null;
}

module.exports = {
  getDb,
  setDb,
  transaction,
  withRetry,
  isTransientError,
  ping,
  closeDb,
  isConfigured,
  schema
};
