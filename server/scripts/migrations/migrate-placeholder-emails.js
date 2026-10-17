/**
 * Moves generated placeholder staff emails (`…@<anything>.local`, created when
 * an import row had no email) onto the current placeholder domain, so old
 * product names never show in staff records. Real addresses are untouched.
 *
 * Dry run by default; pass --apply to write.
 *   node scripts/migrations/migrate-placeholder-emails.js
 *   node scripts/migrations/migrate-placeholder-emails.js --apply
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const { connectPlatformDB, getPlatformConnection } = require('../../src/config/platformDatabase');
const { getPlatformModels } = require('../../src/tenancy/platformModels');
const { getTenantConnectionAndModels } = require('../../src/tenancy/tenantConnectionManager');
const { PLACEHOLDER_EMAIL_DOMAIN } = require('../../src/utils/placeholderEmail');

const APPLY = process.argv.includes('--apply');
const OUTDATED = /@(?!capabble\.local$)[^@]+\.local$/i;

const run = async () => {
  await connectPlatformDB();
  const tenants = await getPlatformModels().Tenant.find({}).select('slug dbName').lean();
  console.log(`[placeholder-emails] ${APPLY ? 'APPLYING' : 'DRY RUN (pass --apply to write)'} for ${tenants.length} tenant(s)`);

  // eslint-disable-next-line no-restricted-syntax
  for (const tenant of tenants) {
    // eslint-disable-next-line no-await-in-loop
    const { connection } = getTenantConnectionAndModels(tenant.dbName, ['User']);
    const teachers = connection.db.collection('teachers');
    // eslint-disable-next-line no-await-in-loop
    const docs = await teachers.find({ email: { $regex: OUTDATED } }).project({ email: 1 }).toArray();
    if (APPLY && docs.length) {
      // eslint-disable-next-line no-await-in-loop
      await teachers.bulkWrite(docs.map((doc) => ({
        updateOne: {
          filter: { _id: doc._id },
          update: { $set: { email: doc.email.replace(/@[^@]+$/, `@${PLACEHOLDER_EMAIL_DOMAIN}`) } },
        },
      })));
    }
    console.log(`${tenant.slug}: ${docs.length} placeholder email(s) ${APPLY ? 'updated' : 'to update'}`);
  }
};

run()
  .catch((error) => {
    console.error(`[placeholder-emails] failed: ${error.message}`);
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
