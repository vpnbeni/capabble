#!/usr/bin/env node
/**
 * Seed ASETS into a tenant database.
 * Usage: node scripts/seeds/seed-asets.js [tenantSlug]
 * Default tenantSlug: ib (or first active tenant)
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../../../.env') });
require('dotenv').config();

const mongoose = require('mongoose');
const { seedAsets } = require('../../src/seeders/asetsSeeder');
const { registerTenantModels } = require('../../src/tenancy/registerTenantModels');
const { MODULE_MODEL_KEYS } = require('../../src/constants/moduleModelKeys');

const run = async () => {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is required');

  await mongoose.connect(uri);
  const centralName = process.env.CENTRAL_DB_NAME || 'capabble_central';
  const prefix = process.env.TENANT_DB_PREFIX || 'tenant_';
  const central = mongoose.connection.useDb(centralName);
  const Tenant = central.collection('tenants');

  const slugArg = process.argv[2];
  const tenant = slugArg
    ? await Tenant.findOne({ slug: slugArg })
    : await Tenant.findOne({ status: { $ne: 'deleted' } });

  if (!tenant) throw new Error('No tenant found to seed');

  const dbName = tenant.dbName || `${prefix}${tenant.slug}`;
  const conn = await mongoose.createConnection(uri, { dbName }).asPromise();
  const modelKeys = [...MODULE_MODEL_KEYS.core, ...MODULE_MODEL_KEYS.asets];
  const models = registerTenantModels(conn, modelKeys);
  const result = await seedAsets(models);
  console.log(`[seed-asets] tenant=${tenant.slug} db=${dbName}`, result);
  await conn.close();
  await mongoose.disconnect();
};

run().catch(async (error) => {
  console.error('[seed-asets] failed', error);
  try { await mongoose.disconnect(); } catch (_) { /* ignore */ }
  process.exit(1);
});
