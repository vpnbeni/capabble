const { sql } = require('drizzle-orm');
const s = require('../db/schema');

// Module codes and names as in client/src/constants/moduleRegistry.ts. Core is free and always on.
const MODULES = [
  { code: 'core', name: 'Core', isCore: true, sortOrder: 0, description: 'Dashboard, school profile, users, billing and help' },
  { code: 'stdnt', name: 'Student Management', sortOrder: 10 },
  { code: 'staaf', name: 'Human Resource Management', sortOrder: 20 },
  { code: 'attnd', name: 'Attendance Management', sortOrder: 30 },
  { code: 'acdmc', name: 'Academics', sortOrder: 40 },
  { code: 'timetable', name: 'Timetable Management', sortOrder: 50 },
  { code: 'actvt', name: 'Activities', sortOrder: 60 },
  { code: 'mdcl', name: 'Medical Clinic', sortOrder: 70 },
  { code: 'asets', name: 'Asset Management', sortOrder: 80 },
  { code: 'libry', name: 'Library Management', sortOrder: 90 },
  { code: 'appnt', name: 'Appointments', sortOrder: 100 },
  { code: 'cpitl', name: 'Capital & Finance', sortOrder: 110 },
  { code: 'trnst', name: 'School Transport', sortOrder: 120 },
  { code: 'exmcl', name: 'Internal Exams', sortOrder: 130 },
  { code: 'cntr', name: 'Exam Centre Control', sortOrder: 140 }
];

// Placeholder prices for development branches; the platform admin sets real ones.
const SAMPLE_MONTHLY_PAISE = 150000; // ₹1,500 for up to 500 students
const SAMPLE_PER_STUDENT_PAISE = 300; // ₹3 per student above 500

async function seedCatalog(db, { withPrices = false } = {}) {
  let modules = 0;
  let prices = 0;
  for (const mod of MODULES) {
    const inserted = await db.insert(s.modules).values({ description: '', isCore: false, ...mod })
      .onConflictDoNothing().returning();
    modules += inserted.length;
  }
  if (withPrices) {
    for (const mod of MODULES.filter((m) => !m.isCore)) {
      for (const [interval, base, perStudent] of [
        ['month', SAMPLE_MONTHLY_PAISE, SAMPLE_PER_STUDENT_PAISE],
        ['year', SAMPLE_MONTHLY_PAISE * 10, SAMPLE_PER_STUDENT_PAISE * 10]
      ]) {
        const exists = await db.execute(sql`select 1 from billing.module_prices where module_code = ${mod.code} and interval = ${interval} and effective_to is null`);
        if (exists.rows.length) continue;
        await db.insert(s.modulePrices).values({
          moduleCode: mod.code,
          interval,
          basePaise: base,
          includedStudents: 500,
          perStudentPaise: perStudent,
          effectiveFrom: new Date('2026-01-01T00:00:00Z')
        });
        prices += 1;
      }
    }
  }
  return { modules, prices };
}

module.exports = { MODULES, seedCatalog };
