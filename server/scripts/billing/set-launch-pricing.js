// Launch pricing: the whole system for ₹60,000 a year (₹5,500 a month), and 50% off the
// first invoice with the LAUNCH50 code (the whole first year on yearly plans).
//
// How it is built from the catalog:
//   - Each module gets a list price (below). A school buying single modules pays these.
//   - The "complete" bundle has every module at 50% off, which brings the list total
//     (₹1,20,000 a year / ₹11,000 a month) to ₹60,000 a year / ₹5,500 a month.
//   - Prices cover up to 500 students; each student above that costs the same share, so
//     the whole system is ₹120 a year (₹11 a month) per extra student after the bundle.
//   - LAUNCH50 takes 50% off what is left after the bundle, on the first invoice only:
//     ₹30,000 for the first year. GST (18%) is added on top of every figure here.
//
// Safe to run more than once: prices that already match are left alone, the bundle and
// coupon are upserted. A changed price adds a new version from now; issued invoices keep
// the price they were issued with.
//
//   npm run billing:launch-pricing                                   dry run
//   npm run billing:launch-pricing -- --apply                        writes
//   npm run billing:launch-pricing -- --apply --offer-ends 2027-03-31  LAUNCH50 expires at the end of that day (IST)
require('dotenv').config();

const { getDb, closeDb } = require('../../src/modules/billing/db/client');
const catalog = require('../../src/modules/billing/services/catalogService');
const { seedCatalog } = require('../../src/modules/billing/services/seedService');

const ACTOR = { type: 'system', id: 'script:set-launch-pricing' };
const INCLUDED_STUDENTS = 500;
const rupees = (n) => Math.round(n * 100);

// List prices in rupees. Yearly adds up to ₹1,20,000 and monthly to ₹11,000.
// Per student = price ÷ 500, so an extra student costs what an included one does.
const TIERS = {
  large: { year: 12000, month: 1100 },
  medium: { year: 7200, month: 640 },
  small: { year: 4000, month: 400 }
};
const MODULE_TIERS = {
  stdnt: 'large',
  staaf: 'large',
  acdmc: 'large',
  cpitl: 'large',
  exmcl: 'large',
  cntr: 'large',
  attnd: 'medium',
  timetable: 'medium',
  asets: 'medium',
  libry: 'medium',
  trnst: 'medium',
  actvt: 'small',
  mdcl: 'small',
  appnt: 'small'
};

const BUNDLE = {
  code: 'complete',
  name: 'Complete school',
  description: 'Every Capabble module for one price.',
  discountBps: 5000
};

const COUPON = {
  code: 'LAUNCH50',
  description: 'Launch offer: 50% off your first year (first invoice).',
  percentBps: 5000,
  duration: 'once'
};

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i === -1 ? null : process.argv[i + 1];
}

function priceFor(code, interval) {
  const listRupees = TIERS[MODULE_TIERS[code]][interval];
  const basePaise = rupees(listRupees);
  return { basePaise, includedStudents: INCLUDED_STUDENTS, perStudentPaise: basePaise / INCLUDED_STUDENTS };
}

const fmt = (paise) => `₹${(paise / 100).toLocaleString('en-IN')}`;

async function run() {
  if (!process.env.BILLING_DATABASE_URL) throw new Error('BILLING_DATABASE_URL is not configured.');
  const apply = process.argv.includes('--apply');
  const offerEnds = argValue('--offer-ends');
  const expiresAt = offerEnds ? new Date(`${offerEnds}T23:59:59+05:30`) : null;
  if (offerEnds && Number.isNaN(expiresAt.getTime())) throw new Error(`--offer-ends must be YYYY-MM-DD, got ${offerEnds}`);

  const host = new URL(process.env.BILLING_DATABASE_URL).host;
  console.log(`[launch-pricing] ${apply ? 'APPLY' : 'dry run'} · billing database: ${host}`);

  const db = getDb();
  if (apply) await seedCatalog(db); // makes sure every module exists; never adds prices
  const modules = (await catalog.listModules({ includeInactive: true }, db)).filter((m) => !m.isCore);

  const known = new Set(modules.map((m) => m.code));
  const missing = Object.keys(MODULE_TIERS).filter((code) => !known.has(code));
  if (missing.length && apply) throw new Error(`Modules missing from the catalog: ${missing.join(', ')}`);
  const unpriced = modules.filter((m) => !MODULE_TIERS[m.code]).map((m) => m.code);
  if (unpriced.length) throw new Error(`No launch price set for: ${unpriced.join(', ')}. Add them to MODULE_TIERS.`);

  // Module prices
  let changed = 0;
  for (const code of Object.keys(MODULE_TIERS)) {
    const mod = modules.find((m) => m.code === code);
    for (const interval of ['year', 'month']) {
      const want = priceFor(code, interval);
      const have = mod?.prices[interval];
      const same = have && have.basePaise === want.basePaise
        && have.includedStudents === want.includedStudents && have.perStudentPaise === want.perStudentPaise;
      const was = have ? `${fmt(have.basePaise)} + ${fmt(have.perStudentPaise)}/student` : 'none';
      const now = `${fmt(want.basePaise)} + ${fmt(want.perStudentPaise)}/student`;
      if (same) {
        console.log(`  same     ${code.padEnd(10)} ${interval.padEnd(5)} ${now}`);
        continue;
      }
      changed += 1;
      console.log(`  ${apply ? 'set ' : 'would set'} ${code.padEnd(10)} ${interval.padEnd(5)} ${was} -> ${now}`);
      if (apply) await catalog.setModulePrice(ACTOR, { moduleCode: code, interval, ...want });
    }
  }

  // Bundle with every module
  const moduleCodes = Object.keys(MODULE_TIERS).sort();
  console.log(`  ${apply ? 'upsert' : 'would upsert'} bundle ${BUNDLE.code}: ${moduleCodes.length} modules, ${BUNDLE.discountBps / 100}% off`);
  if (apply) await catalog.upsertBundle(ACTOR, { ...BUNDLE, moduleCodes, active: true });

  // Launch coupon
  const existing = await catalog.getCoupon(COUPON.code, db);
  if (existing && existing.redeemedCount > 0 && existing.percentBps !== COUPON.percentBps) {
    throw new Error(`${COUPON.code} has been used with a different discount; pick a new code.`);
  }
  console.log(`  ${apply ? 'upsert' : 'would upsert'} coupon ${COUPON.code}: ${COUPON.percentBps / 100}% off the first invoice${expiresAt ? `, until ${offerEnds}` : ', no end date'}`);
  if (apply) {
    await catalog.upsertCoupon(ACTOR, {
      ...COUPON,
      expiresAt,
      maxRedemptions: existing?.maxRedemptions ?? null,
      active: true
    });
  }

  // What a school will see for the whole system, before GST
  const sum = (interval) => moduleCodes.reduce((total, code) => total + priceFor(code, interval).basePaise, 0);
  const afterBundle = (paise) => paise - Math.round((paise * BUNDLE.discountBps) / 10000);
  const year = afterBundle(sum('year'));
  const month = afterBundle(sum('month'));
  console.log(`[launch-pricing] whole system, up to ${INCLUDED_STUDENTS} students, before GST:`);
  console.log(`  yearly  list ${fmt(sum('year'))} -> bundle ${fmt(year)} -> first year with ${COUPON.code} ${fmt(year / 2)}`);
  console.log(`  monthly list ${fmt(sum('month'))} -> bundle ${fmt(month)} (${fmt(month * 12)} a year) -> first month with ${COUPON.code} ${fmt(month / 2)}`);
  console.log(`[launch-pricing] ${changed} price${changed === 1 ? '' : 's'} ${apply ? 'changed' : 'to change'}`);
  if (!apply) console.log('[launch-pricing] re-run with --apply to write');
}

run()
  .catch((error) => {
    console.error('[launch-pricing] failed', error.cause?.message || error.message);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
