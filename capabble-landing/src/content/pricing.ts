/*
 * Prices on the Pricing page. They mirror the billing catalog that
 * server/scripts/billing/set-launch-pricing.js writes; change both together.
 * Amounts are in rupees and exclude GST.
 */

export type Interval = "year" | "month";
type Tier = "large" | "medium" | "small";

export const INCLUDED_STUDENTS = 500;
export const BUNDLE_DISCOUNT = 0.5;
export const TRIAL_DAYS = 14;
export const GST_RATE = 18;
export const LAUNCH_CODE = "LAUNCH50";

const TIERS: Record<Tier, Record<Interval, number>> = {
  large: { year: 12000, month: 1100 },
  medium: { year: 7200, month: 640 },
  small: { year: 4000, month: 400 },
};

export type PricedModule = { code: string; name: string; text: string; tier: Tier };

export const moduleGroups: { title: string; modules: PricedModule[] }[] = [
  {
    title: "Students and staff",
    modules: [
      { code: "stdnt", name: "Student Management", text: "Admissions, profiles, classes and sections", tier: "large" },
      { code: "staaf", name: "Human Resource Management", text: "Staff records and roles", tier: "large" },
      { code: "attnd", name: "Attendance Management", text: "Daily attendance for students and staff", tier: "medium" },
      { code: "appnt", name: "Appointments", text: "Parent and visitor meetings, walk-ins and check-in", tier: "small" },
    ],
  },
  {
    title: "Teaching and exams",
    modules: [
      { code: "acdmc", name: "Academics", text: "Curriculum and syllabus planning", tier: "large" },
      { code: "timetable", name: "Timetable Management", text: "Timetables built without clashes", tier: "medium" },
      { code: "exmcl", name: "Internal Exams", text: "Class tests, marks and report cards", tier: "large" },
      { code: "cntr", name: "Exam Centre Control", text: "CBSE centre seating, duties, Form 66 and dispatch", tier: "large" },
      { code: "actvt", name: "Activities", text: "Clubs, sports and co-curricular records", tier: "small" },
    ],
  },
  {
    title: "Operations and finance",
    modules: [
      { code: "cpitl", name: "Capital & Finance", text: "Fees, receipts, payroll and expenses", tier: "large" },
      { code: "trnst", name: "School Transport", text: "Routes, vehicles and stops", tier: "medium" },
      { code: "asets", name: "Asset Management", text: "Assets, stock, maintenance and audits", tier: "medium" },
      { code: "libry", name: "Library Management", text: "Catalogue, issues and returns", tier: "medium" },
      { code: "mdcl", name: "Medical Clinic", text: "Health records and clinic visits", tier: "small" },
    ],
  },
];

const allModules = moduleGroups.flatMap((g) => g.modules);

export const MODULE_COUNT = allModules.length;

export const modulePrice = (m: PricedModule, interval: Interval) => TIERS[m.tier][interval];

export const lowestModulePrice = (interval: Interval) => Math.min(...Object.values(TIERS).map((t) => t[interval]));

const listTotal = (interval: Interval) => allModules.reduce((sum, m) => sum + modulePrice(m, interval), 0);

/** The whole system with the bundle discount: ₹60,000 a year, ₹5,500 a month. */
export const completePrice = (interval: Interval) => listTotal(interval) * (1 - BUNDLE_DISCOUNT);
export const completeListPrice = listTotal;

/** What each student above the included count costs, for the whole system. */
export const completePerStudent = (interval: Interval) => completePrice(interval) / INCLUDED_STUDENTS;
export const modulePerStudent = (m: PricedModule, interval: Interval) => modulePrice(m, interval) / INCLUDED_STUDENTS;

export const inr = (rupees: number) =>
  `₹${rupees.toLocaleString("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: Number.isInteger(rupees) ? 0 : 2 })}`;
