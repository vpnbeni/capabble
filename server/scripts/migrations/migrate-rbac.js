/**
 * RBAC migration (idempotent). For every tenant:
 *   1. Repairs `users` indexes: removes the TTL index on refreshTokens.createdAt
 *      (it deleted whole user documents) and the old non-partial unique email
 *      index; creates the current partial unique email/username indexes.
 *   2. Gives existing staff a role: admin → Administrator,
 *      data_entry_operator → Office staff. Sets kind = 'staff'.
 *   3. Drops stored refresh tokens in the old format and bumps tokenVersion so
 *      everyone signs in again under the new cookie sessions.
 *
 * Dry run by default; pass --apply to write.
 *   node scripts/migrations/migrate-rbac.js            # report only
 *   node scripts/migrations/migrate-rbac.js --apply    # migrate
 *   node scripts/migrations/migrate-rbac.js --apply --tenant=<slug>
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const { connectPlatformDB, getPlatformConnection } = require('../../src/config/platformDatabase');
const { getPlatformModels } = require('../../src/tenancy/platformModels');
const { getTenantConnectionAndModels } = require('../../src/tenancy/tenantConnectionManager');
const { repairUserIndexes, LEGACY_INDEXES } = require('../../src/rbac/userIndexes');
const { LEGACY_ROLE_TEMPLATE } = require('../../src/rbac/catalog');

const APPLY = process.argv.includes('--apply');
const tenantArg = process.argv.find((arg) => arg.startsWith('--tenant='));
const ONLY_TENANT = tenantArg ? tenantArg.split('=')[1] : null;

const migrateTenant = async (tenant) => {
  const { models } = getTenantConnectionAndModels(tenant.dbName, ['User', 'Role', 'AuthAuditLog']);
  const { User } = models;

  const indexNames = (await User.collection.indexes().catch(() => [])).map((index) => index.name);
  const legacyIndexes = LEGACY_INDEXES.filter((name) => indexNames.includes(name));

  const users = await User.find({}).select('email role roles kind').lean();
  const toAssign = users.filter((user) => (!user.roles || user.roles.length === 0)
    && (!user.kind || user.kind === 'staff')
    && LEGACY_ROLE_TEMPLATE[user.role]);

  const summary = {
    tenant: tenant.slug,
    users: users.length,
    legacyIndexes,
    rolesToAssign: toAssign.map((user) => `${user.email}: ${user.role} -> ${LEGACY_ROLE_TEMPLATE[user.role].join(',')}`)
  };

  if (!APPLY) return summary;

  summary.droppedIndexes = await repairUserIndexes(User);
  await Promise.all(toAssign.map((user) => User.updateOne(
    { _id: user._id },
    { $set: { roles: LEGACY_ROLE_TEMPLATE[user.role], kind: 'staff' } }
  )));
  await User.updateMany({ kind: { $exists: false } }, { $set: { kind: 'staff' } });
  // Old-format refresh tokens ({ token, createdAt }) can never be used again.
  await User.updateMany({}, { $set: { refreshTokens: [] }, $inc: { tokenVersion: 1 } });
  // Roles and the audit log are created lazily on first write; creating them
  // here can fail on clusters at their collection limit, which is not fatal.
  await Promise.all([models.AuthAuditLog, models.Role].map((Model) => Model.createIndexes().catch((error) => {
    summary.warnings = [...(summary.warnings || []), `${Model.modelName}: ${error.message}`];
  })));
  return summary;
};

const run = async () => {
  await connectPlatformDB();
  const { Tenant } = getPlatformModels();
  const tenants = await Tenant.find(ONLY_TENANT ? { slug: ONLY_TENANT } : {}).select('slug dbName status').lean();

  console.log(`[rbac-migration] ${APPLY ? 'APPLYING' : 'DRY RUN (pass --apply to write)'} for ${tenants.length} tenant(s)`);
  // One tenant at a time keeps the output readable and the load low.
  // eslint-disable-next-line no-restricted-syntax
  for (const tenant of tenants) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const summary = await migrateTenant(tenant);
      console.log(JSON.stringify(summary, null, 2));
    } catch (error) {
      console.error(`[rbac-migration] tenant=${tenant.slug} failed: ${error.message}`);
      process.exitCode = 1;
    }
  }
};

run()
  .catch((error) => {
    console.error(`[rbac-migration] failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await getPlatformConnection().close();
    } catch {
      // Ignore connection close errors on shutdown.
    }
    process.exit(process.exitCode || 0);
  });
