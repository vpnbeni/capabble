/**
 * Legacy calendar → school days (idempotent).
 *
 * The old `calendars` collection held one document per year with an
 * `isHoliday` flag per date. Its API was switched off long ago, but a school
 * may still have holidays in it. This copies each marked holiday into
 * `school_day_rules` as a holiday, once. The four defaults the old seeder put
 * in by itself (1 Jan, 15 Aug, 2 Oct, 25 Dec with its own names) are skipped,
 * because no school chose them. The old collection is left untouched.
 *
 * Dry run by default; pass --apply to write.
 *   node scripts/migrations/migrate-legacy-calendar.js
 *   node scripts/migrations/migrate-legacy-calendar.js --apply --tenant=<slug>
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const { connectPlatformDB, getPlatformConnection } = require('../../src/config/platformDatabase');
const { getPlatformModels } = require('../../src/tenancy/platformModels');
const { getTenantConnectionAndModels } = require('../../src/tenancy/tenantConnectionManager');
const schoolDate = require('../../src/utils/schoolDate');

const APPLY = process.argv.includes('--apply');
const tenantArg = process.argv.find((arg) => arg.startsWith('--tenant='));
const ONLY_TENANT = tenantArg ? tenantArg.split('=')[1] : null;

const SEEDED = new Set(["01-01:New Year's Day", '08-15:Independence Day', '10-02:Gandhi Jayanti', '12-25:Christmas Day']);

/** Holidays from the old year documents, as { date, title }. Pure, for testing. */
const legacyHolidays = (docs) => {
  const out = new Map();
  docs.forEach((doc) => (doc.dates || []).forEach((day) => {
    if (!day.isHoliday || !day.date) return;
    // Old dates were saved at local midnight; the India-time day is the intended one.
    const key = schoolDate.dateKey(day.date);
    const title = String(day.holidayName || 'Holiday').trim().slice(0, 120);
    if (!key || SEEDED.has(`${key.slice(5)}:${title}`)) return;
    out.set(key, { date: key, title });
  }));
  return [...out.values()].sort((a, b) => a.date.localeCompare(b.date));
};

const migrateTenant = async (tenant) => {
  const { connection, models } = getTenantConnectionAndModels(tenant.dbName, ['SchoolDayRule']);
  const exists = await connection.db.listCollections({ name: 'calendars' }, { nameOnly: true }).toArray();
  if (!exists.length) return { tenant: tenant.slug, legacy: 'none' };

  const docs = await connection.db.collection('calendars').find({}, { projection: { dates: 1 } }).toArray();
  const holidays = legacyHolidays(docs);
  const { SchoolDayRule } = models;
  const existing = new Set((await SchoolDayRule.find({ kind: 'holiday', startDate: { $in: holidays.map((h) => h.date) } })
    .select('startDate').lean()).map((rule) => rule.startDate));
  const toCreate = holidays.filter((holiday) => !existing.has(holiday.date));
  const summary = { tenant: tenant.slug, legacyHolidays: holidays.length, toCreate: toCreate.map((h) => `${h.date} ${h.title}`) };
  if (!APPLY || !toCreate.length) return summary;

  await SchoolDayRule.insertMany(toCreate.map((holiday) => ({
    kind: 'holiday',
    title: holiday.title,
    startDate: holiday.date,
    endDate: holiday.date,
    category: 'school',
    appliesTo: { scope: 'school', classes: [], sections: [] },
    reason: 'Copied from the old calendar',
    academicSession: schoolDate.sessionLabelFor(holiday.date)
  })));
  summary.created = toCreate.length;
  return summary;
};

const run = async () => {
  await connectPlatformDB();
  const { Tenant } = getPlatformModels();
  const tenants = await Tenant.find(ONLY_TENANT ? { slug: ONLY_TENANT } : {}).select('slug dbName').lean();
  console.log(`[legacy-calendar] ${APPLY ? 'APPLYING' : 'DRY RUN (pass --apply to write)'} for ${tenants.length} tenant(s)`);
  // eslint-disable-next-line no-restricted-syntax
  for (const tenant of tenants) {
    try {
      // eslint-disable-next-line no-await-in-loop
      console.log(JSON.stringify(await migrateTenant(tenant)));
    } catch (error) {
      console.error(`[legacy-calendar] tenant=${tenant.slug} failed: ${error.message}`);
      process.exitCode = 1;
    }
  }
};

if (require.main === module) {
  run()
    .catch((error) => {
      console.error(`[legacy-calendar] failed: ${error.message}`);
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
}

module.exports = { legacyHolidays };
