/**
 * Backfill academic session on all existing tenant records.
 *
 * After deploying the `academicSessionPlugin`, existing records in tenant
 * databases have no `academicSession` field.  The plugin's query pre-hooks
 * automatically add `{ academicSession: <current> }` to every query, which
 * means those legacy records become invisible.
 *
 * This script:
 *   1. Connects to the platform DB and lists all tenants.
 *   2. For each tenant, connects to its DB and registers all models.
 *   3. Updates every document where `academicSession` is missing/null,
 *      setting it to a default value (the current academic session).
 *
 * Usage:
 *   node server/scripts/migrations/backfill-academic-session.js [YYYY-YYYY]
 *
 * If a session label is passed as an argument, that label is used.
 * Otherwise the script derives the current session from today's date
 * (Indian academic year: Apr–Mar).
 *
 * Safe to re-run — only touches documents that lack `academicSession`.
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const { connectPlatformDB } = require('../../src/config/platformDatabase');
const { getPlatformModels } = require('../../src/tenancy/platformModels');
const { getTenantConnectionAndModels } = require('../../src/tenancy/tenantConnectionManager');

/** Derive academic session label from today (Apr-Mar Indian academic year). */
const currentSessionLabel = () => {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  const startYear = month <= 3 ? year - 1 : year;
  return `${startYear}-${startYear + 1}`;
};

/** Models that received the academicSessionPlugin. */
const SESSION_SCOPED_MODELS = [
  'Teacher',
  'Student',
  'Subject',
  'Candidate',
  'DateSheet',
  'Room',
  'AnswerSheet',
  'AnswerSheetDispatch',
  'FolderMapping',
  'CBSEDatesheet',
  'CBSECircular',
  'Form66',
  'Form66Upload',
  'Guideline',
  'Undertaking',
  'CentreDetail',
  'SeatingPlanTemplateSetting',
  'SeatingPlanAllocation',
  'DutyAllocationSetting',
  'DutyAssignment',
  'DutySelection',
  'SupportTicket',
];

const backfill = async () => {
  const sessionLabel = process.argv[2] || currentSessionLabel();
  console.log(`\n=== Backfill academic session: ${sessionLabel} ===\n`);

  await connectPlatformDB();
  const { Tenant } = getPlatformModels();

  const tenants = await Tenant.find({}).select('slug dbName status').lean();
  console.log(`Found ${tenants.length} tenant(s)\n`);

  let grandTotal = 0;

  for (const tenant of tenants) {
    console.log(`--- Tenant: ${tenant.slug} (db: ${tenant.dbName}) ---`);

    let connection;
    let models;
    try {
      const result = getTenantConnectionAndModels(tenant.dbName, SESSION_SCOPED_MODELS);
      connection = result.connection;
      models = result.models;
    } catch (err) {
      console.warn(`  [SKIP] Could not connect/register models: ${err.message}`);
      continue;
    }

    let tenantTotal = 0;

    for (const modelName of SESSION_SCOPED_MODELS) {
      const Model = models[modelName];
      if (!Model) {
        continue;
      }

      try {
        // Direct MongoDB updateMany bypasses Mongoose hooks (including the
        // plugin's pre-hooks), so we can target documents that lack the field.
        const result = await Model.collection.updateMany(
          {
            $or: [
              { academicSession: { $exists: false } },
              { academicSession: null },
              { academicSession: '' },
            ],
          },
          { $set: { academicSession: sessionLabel } }
        );

        const count = result.modifiedCount || 0;
        if (count > 0) {
          console.log(`  ${modelName}: updated ${count} document(s)`);
          tenantTotal += count;
        }
      } catch (err) {
        console.warn(`  ${modelName}: ERROR — ${err.message}`);
      }
    }

    // Also ensure the AcademicSession record itself exists for this tenant
    try {
      const AcademicSession = models.AcademicSession || (() => {
        const { getTenantConnectionAndModels: get } = require('../../src/tenancy/tenantConnectionManager');
        return get(tenant.dbName, ['AcademicSession']).models.AcademicSession;
      })();

      if (AcademicSession) {
        const [startYear] = sessionLabel.split('-').map(Number);
        await AcademicSession.findOneAndUpdate(
          { label: sessionLabel },
          {
            $setOnInsert: {
              label: sessionLabel,
              startYear,
              endYear: startYear + 1,
              status: 'active',
            },
          },
          { upsert: true, new: true }
        );
      }
    } catch (err) {
      console.warn(`  AcademicSession upsert: ${err.message}`);
    }

    if (tenantTotal > 0) {
      console.log(`  TOTAL: ${tenantTotal} document(s) updated`);
    } else {
      console.log(`  (no documents needed updating)`);
    }

    grandTotal += tenantTotal;
  }

  console.log(`\n=== Done. ${grandTotal} document(s) updated across all tenants. ===\n`);
  process.exit(0);
};

backfill().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
