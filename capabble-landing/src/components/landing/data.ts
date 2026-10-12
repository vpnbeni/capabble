import type { IconName } from "./primitives";

export type Tone = "success" | "warning" | "danger" | "info" | "neutral" | "accent";

/*
 * Photography in /public/landing. A null path renders a styled placeholder instead.
 */
export const PHOTOS: Record<string, string | null> = {
  develop: "/landing/how-develop.jpg",
  developMobile: "/landing/how-develop-mobile.jpg",
  license: "/landing/how-license.jpg",
  licenseMobile: "/landing/how-license-mobile.jpg",
  implement: "/landing/how-implement.jpg",
  implementMobile: "/landing/how-implement-mobile.jpg",
  maintain: "/landing/how-maintain.jpg",
  maintainMobile: "/landing/how-maintain-mobile.jpg",
  // The design reuses the hero shots for these two menu tiles
  transport: "/landing/hero-student-mobile.jpg",
  library: "/landing/hero-student.jpg",
};

export const solutions: {
  icon: IconName;
  title: string;
  text: string;
  points: string[];
  featured?: boolean;
  menuTag: string;
  menuText: string;
}[] = [
  {
    icon: "layout-grid",
    title: "SaaS platforms",
    featured: true,
    text: "Cloud software that runs an institution end to end, from admissions and attendance to fees and reports.",
    points: [
      "One login for leadership, staff, teachers and parents",
      "Web and mobile apps for every role",
      "Licensed per campus, updated for everyone at once",
    ],
    menuTag: "16+ modules",
    menuText: "School OS runs admissions, attendance, fees, exams and more, on web and mobile.",
  },
  {
    icon: "sparkles",
    title: "AI applications",
    text: "AI built into the work your staff already do.",
    points: ["Report-card remarks and notices drafted", "Attendance and performance alerts", "Answers to routine parent questions"],
    menuTag: "New",
    menuText: "AI that drafts remarks and notices, spots trends and answers routine questions.",
  },
  {
    icon: "building-2",
    title: "ERP solutions",
    text: "Run the back office for schools and for organisations outside education.",
    points: ["Accounts, GST and fee ledgers", "HR, payroll and leave", "Inventory, assets and purchasing"],
    menuTag: "GST-ready",
    menuText: "Accounts, payroll, inventory and purchasing for schools and other organisations.",
  },
  {
    icon: "wrench",
    title: "Implementation and support",
    text: "We set it up with you, then stay to keep it running.",
    points: ["Data migration from your old system", "Role-by-role staff training", "Updates, monitoring and support"],
    menuTag: "On site",
    menuText: "Migration, setup and training through go-live, then support that stays.",
  },
  {
    icon: "laptop",
    title: "IT-enabled services",
    text: "Everything around the software, handled by the same team.",
    points: ["Custom software and websites", "Integrations with tools you use", "Managed IT for campuses and offices"],
    menuTag: "Custom",
    menuText: "Websites, integrations and managed IT, connected to everything you already use.",
  },
];

export const suite: { code: string; name: string; icon: IconName }[] = [
  { code: "ATTND", name: "Attendance", icon: "calendar-check" },
  { code: "CPITL", name: "Fees", icon: "wallet" },
  { code: "TMTBL", name: "Timetable", icon: "calendar-days" },
  { code: "CNTR", name: "Exam Centre", icon: "clipboard-check" },
  { code: "TRNST", name: "Transport", icon: "bus" },
  { code: "CNTCT", name: "Messages", icon: "messages-square" },
];

export const phoneModules: { icon: IconName; label: string }[] = [
  { icon: "calendar-check", label: "Attendance" },
  { icon: "notebook-pen", label: "Homework" },
  { icon: "clipboard-check", label: "Exams" },
  { icon: "book-open", label: "Academics" },
  { icon: "bus", label: "Transport" },
  { icon: "library", label: "Library" },
  { icon: "trophy", label: "Activities" },
  { icon: "chart-line", label: "Progress" },
  { icon: "ellipsis", label: "More" },
];

export const logos: {
  name: string;
  icon: IconName;
  font: string;
  size: string;
  weight: number;
  track: string;
  upper: boolean;
}[] = [
  { name: "Aravali Vidyapeeth", icon: "mountain", font: 'Georgia, "Times New Roman", serif', size: "16px", weight: 700, track: "0", upper: false },
  { name: "Shivalik Heights", icon: "school", font: "var(--font-sans)", size: "13px", weight: 800, track: "0.12em", upper: true },
  { name: "Saraswati Global", icon: "book-open", font: "var(--font-sans)", size: "16px", weight: 600, track: "-0.02em", upper: false },
  { name: "Northgate", icon: "graduation-cap", font: 'Georgia, "Times New Roman", serif', size: "17px", weight: 400, track: "0.02em", upper: false },
  { name: "Kadyan Agro", icon: "trees", font: "var(--font-sans)", size: "14px", weight: 700, track: "0.06em", upper: true },
  { name: "Haryana Model School", icon: "landmark", font: 'Georgia, "Times New Roman", serif', size: "15px", weight: 600, track: "0.01em", upper: false },
];

export const stats = [
  { v: "16+", label: "Integrated school modules" },
  { v: "40+", label: "Institutions running on Capabble" },
  { v: "25K", label: "Students, parents and staff served" },
  { v: "99.9%", label: "Platform uptime" },
];

export const stories = [
  {
    quote:
      "Attendance used to eat the first ten minutes of every class. Now teachers mark it in under a minute, and I can see the whole school's numbers before assembly ends.",
    name: "Dr. Meenakshi Rathee",
    role: "Principal, Aravali Vidyapeeth, Rohtak",
  },
  {
    quote:
      "We run both our campuses on one system now: fees, payroll and bus routes in one place. The Capabble team was on site for every step of the move, not just the sales call.",
    name: "Rajesh Malik",
    role: "Director, Shivalik Heights School",
  },
  {
    quote:
      "Entering marks and building report cards used to take me a full weekend every term. This year it took one evening, and the remarks were half-written for me.",
    name: "Pooja Sharma",
    role: "Senior Teacher, Saraswati Global School",
  },
  {
    quote:
      "I know when my son is absent, when fees are due and what homework he has, without calling the school even once. That alone changed things for us.",
    name: "Ankit Dahiya",
    role: "Parent, Northgate Public School",
  },
  {
    quote:
      "Capabble built our inventory and purchasing ERP in eight weeks and still looks after every update. They are the first software vendor we have never had to chase.",
    name: "Sunil Kadyan",
    role: "Operations Head, Kadyan Agro Industries",
  },
];

type GenStat = { label: string; value: string; unit?: string; hint?: string; icon: IconName; progress?: number };
type GenRow = { icon: IconName; title: string; sub: string; aside: string; badge: string; tone: Tone };

export type Role = {
  icon: IconName;
  title: string;
  text: string;
  points: string[];
  screen: { icon: IconName; title: string; meta: string; user: string };
  menuPhoto: { src: string | null; pos: string };
  gen?: { listTitle: string; stats: GenStat[]; rows: GenRow[] };
};

export const roles: Role[] = [
  {
    icon: "chart-line",
    title: "Leadership",
    text: "The whole school at a glance, every morning.",
    points: ["Live attendance, fees and academics", "Alerts when something slips", "Reports for every board meeting"],
    screen: { icon: "layout-dashboard", title: "Principal's dashboard", meta: "Today · all campuses", user: "Dr. Meenakshi Rathee" },
    menuPhoto: { src: PHOTOS.license, pos: "center 30%" },
  },
  {
    icon: "presentation",
    title: "Teachers",
    text: "Less admin, more teaching.",
    points: ["Attendance in a few taps", "Marks entry and report cards", "Lesson plans and homework"],
    screen: { icon: "calendar-days", title: "My day", meta: "Thursday · 6 periods", user: "Pooja Sharma" },
    menuPhoto: { src: "/landing/teacher.jpg", pos: "center 20%" },
  },
  {
    icon: "users",
    title: "Parents and students",
    text: "Everything about their child, on their phone.",
    points: ["Attendance and homework updates", "Online fee payment", "Notices and school events"],
    screen: { icon: "smartphone", title: "Parent app", meta: "Android and iOS", user: "Ankit Dahiya" },
    menuPhoto: { src: "/landing/parents.jpg", pos: "center 30%" },
  },
  {
    icon: "building",
    title: "Administration",
    text: "The office, without the paperwork.",
    points: ["Fee collection and receipts", "Admissions and student records", "Transport, staff and stock"],
    screen: { icon: "wallet", title: "Fee collection", meta: "Term 2 · 2026–27", user: "Office admin" },
    menuPhoto: { src: PHOTOS.implement, pos: "center 30%" },
  },
  {
    icon: "indian-rupee",
    title: "Accounts",
    text: "Fees, ledgers and GST in one place.",
    points: ["Fee ledgers and receipts", "GST-ready invoices and reports", "Daily cash and bank reconciliation"],
    screen: { icon: "indian-rupee", title: "Accounts", meta: "October 2026", user: "Accounts office" },
    menuPhoto: { src: PHOTOS.maintain, pos: "center 30%" },
    gen: {
      listTitle: "Today's ledger",
      stats: [
        { label: "Collected today", value: "₹1.86L", hint: "64 receipts", icon: "wallet" },
        { label: "Bank reconciled", value: "98", unit: "%", icon: "landmark", progress: 98 },
        { label: "Expenses this month", value: "₹4.2L", hint: "Within budget", icon: "receipt" },
      ],
      rows: [
        { icon: "receipt", title: "Fee receipt · Ishita Verma", sub: "Class 9A · UPI", aside: "₹14,200", badge: "Cleared", tone: "success" },
        { icon: "file-text", title: "Vendor payment · Lab supplies", sub: "Cheque 004512", aside: "₹38,500", badge: "Needs approval", tone: "warning" },
        { icon: "bus", title: "Transport fees · Route 4", sub: "22 students · bank transfer", aside: "₹52,800", badge: "Cleared", tone: "success" },
        { icon: "landmark", title: "GST return · September", sub: "Filed 10 October", aside: "", badge: "Filed", tone: "info" },
      ],
    },
  },
  {
    icon: "bus",
    title: "Transport",
    text: "Every bus, every route, every child.",
    points: ["Live bus tracking for parents", "Route and stop planning", "Pick-up and drop alerts"],
    screen: { icon: "bus", title: "Transport", meta: "Morning routes · live", user: "Transport manager" },
    menuPhoto: { src: PHOTOS.transport, pos: "center 35%" },
    gen: {
      listTitle: "Morning routes",
      stats: [
        { label: "Buses on route", value: "12", unit: "of 14", icon: "bus", progress: 86 },
        { label: "Students on board", value: "486", hint: "Scanned at pick-up", icon: "users" },
        { label: "Running late", value: "1", hint: "Route 7 · 8 min", icon: "clock" },
      ],
      rows: [
        { icon: "bus", title: "Route 2 · Sector 34", sub: "HR-12 4521 · 38 students", aside: "7:42 am", badge: "Arrived", tone: "success" },
        { icon: "bus", title: "Route 4 · Model Town", sub: "HR-12 4588 · 41 students", aside: "7:51 am", badge: "On the way", tone: "info" },
        { icon: "bus", title: "Route 7 · Jind Road", sub: "HR-12 4610 · 35 students", aside: "7:58 am", badge: "8 min late", tone: "warning" },
        { icon: "bus", title: "Route 9 · Sunaria", sub: "HR-12 4702 · 29 students", aside: "8:05 am", badge: "Not started", tone: "neutral" },
      ],
    },
  },
  {
    icon: "library",
    title: "Library",
    text: "Issue, return and find any book.",
    points: ["Barcode issue and return", "Overdue reminders to parents", "Catalogue search for students"],
    screen: { icon: "library", title: "Library", meta: "Today", user: "Librarian" },
    menuPhoto: { src: PHOTOS.library, pos: "75% 60%" },
    gen: {
      listTitle: "Recent activity",
      stats: [
        { label: "Books in catalogue", value: "8,420", icon: "library" },
        { label: "Issued now", value: "312", hint: "Across 28 classes", icon: "book-open" },
        { label: "Overdue", value: "17", hint: "Reminders sent", icon: "calendar-x" },
      ],
      rows: [
        { icon: "book-open", title: "Wings of Fire", sub: "Aarav Sharma · Class 6B", aside: "Due 18 Oct", badge: "Issued", tone: "info" },
        { icon: "book-open", title: "Malgudi Days", sub: "Kabir Singh · Class 4C", aside: "Due 9 Oct", badge: "Overdue", tone: "danger" },
        { icon: "book-open", title: "NCERT Physics, Class 11", sub: "Ananya Gupta · Class 11 Sci", aside: "Today", badge: "Returned", tone: "success" },
        { icon: "book-open", title: "The Jungle Book", sub: "Ishita Verma · Class 9A", aside: "", badge: "Reserved", tone: "neutral" },
      ],
    },
  },
  {
    icon: "briefcase",
    title: "HR and payroll",
    text: "Staff records, leave and salaries.",
    points: ["Staff profiles and documents", "Leave and staff attendance", "Payroll with PF and TDS"],
    screen: { icon: "briefcase", title: "HR and payroll", meta: "October 2026", user: "HR office" },
    menuPhoto: { src: PHOTOS.develop, pos: "center 35%" },
    gen: {
      listTitle: "Needs action",
      stats: [
        { label: "Staff", value: "86", hint: "62 teaching · 24 support", icon: "users" },
        { label: "On leave today", value: "4", icon: "calendar-x" },
        { label: "October payroll", value: "92", unit: "%", icon: "wallet", progress: 92 },
      ],
      rows: [
        { icon: "user-round", title: "Pooja Sharma · Senior Teacher", sub: "Casual leave · 14–15 Oct", aside: "", badge: "Approved", tone: "success" },
        { icon: "user-round", title: "Rajiv Mehta · Driver", sub: "Sick leave · today", aside: "", badge: "Pending", tone: "warning" },
        { icon: "wallet", title: "October payroll", sub: "86 staff", aside: "₹38.6L", badge: "Ready to run", tone: "info" },
        { icon: "file-text", title: "Form 16 · FY 2025–26", sub: "Sent to all staff", aside: "", badge: "Done", tone: "success" },
      ],
    },
  },
];

export const leadAlerts: { icon: IconName; text: string; tone: Tone; badge: string }[] = [
  { icon: "calendar-x", text: "Class 7A attendance is 71% this week", tone: "warning", badge: "Below 75%" },
  { icon: "receipt", text: "42 students have Term 2 fees overdue", tone: "danger", badge: "₹3.1L" },
  { icon: "file-text", text: "Unit Test 2 papers waiting for approval", tone: "info", badge: "3 papers" },
];

export const periods: { time: string; cls: string; subject: string; status: string; tone: Tone }[] = [
  { time: "08:40", cls: "Class 8B", subject: "Mathematics", status: "Attendance marked", tone: "success" },
  { time: "09:25", cls: "Class 7A", subject: "Mathematics", status: "Attendance marked", tone: "success" },
  { time: "10:30", cls: "Class 8C", subject: "Mathematics", status: "Now", tone: "info" },
  { time: "12:05", cls: "Class 6B", subject: "Maths lab", status: "Upcoming", tone: "neutral" },
];

export const parentItems: { icon: IconName; title: string; sub: string }[] = [
  { icon: "notebook-pen", title: "2 homework tasks", sub: "English and Science, due tomorrow" },
  { icon: "wallet", title: "Term 2 fees · ₹12,500", sub: "Due 15 November" },
  { icon: "megaphone", title: "Annual Sports Day", sub: "Saturday 22 November, 8:30 am" },
];

export const payments: { name: string; cls: string; amt: string; status: string; tone: Tone }[] = [
  { name: "Ishita Verma", cls: "Class 9A · Term 2", amt: "₹14,200", status: "Paid", tone: "success" },
  { name: "Kabir Singh", cls: "Class 4C · Term 2", amt: "₹10,800", status: "Paid", tone: "success" },
  { name: "Ananya Gupta", cls: "Class 11 Sci · Term 2", amt: "₹18,500", status: "Part paid", tone: "warning" },
  { name: "Vihaan Yadav", cls: "Class 6B · Term 2", amt: "₹12,500", status: "Overdue", tone: "danger" },
];

export type Step = {
  n: string;
  icon: IconName;
  title: string;
  text: string;
  points: string[];
  kind: "dev" | "lic" | "imp" | "mnt";
  photo: string | null;
  photoMobile: string | null;
  pos: string;
  alt: string;
  vTitle: string;
  vMeta: string;
  vBadge: string;
  vTone: Tone;
};

export const steps: Step[] = [
  {
    n: "01",
    icon: "pencil-ruler",
    title: "Develop",
    text: "We design and build the software, or shape our platforms around how your institution already runs.",
    points: ["Requirement workshops with your team", "Your fee rules, report cards and branding", "Weekly demos while we build"],
    kind: "dev",
    photo: PHOTOS.develop,
    photoMobile: PHOTOS.developMobile,
    pos: "center 40%",
    alt: "A school principal and two Capabble developers smile over app sketches and sticky notes at a round table",
    vTitle: "Project plan · Shivalik Heights School",
    vMeta: "Started 6 October",
    vBadge: "Week 3 of 6",
    vTone: "info",
  },
  {
    n: "02",
    icon: "key-round",
    title: "License",
    text: "Clear licensing per campus or organisation, with pricing that scales as you grow.",
    points: ["One licence per campus, all modules included", "Unlimited staff, parent and student logins", "Every update included, no upgrade fees"],
    kind: "lic",
    photo: PHOTOS.license,
    photoMobile: PHOTOS.licenseMobile,
    pos: "center 40%",
    alt: "A school director shakes hands with a Capabble account manager across his office desk",
    vTitle: "School OS licence",
    vMeta: "Growth plan · annual",
    vBadge: "Active",
    vTone: "success",
  },
  {
    n: "03",
    icon: "zap",
    title: "Implement",
    text: "Data migration, configuration and hands-on training for every role, through go-live.",
    points: ["Your old records moved over for you", "Training for leadership, office, teachers and parents", "Our team on site for go-live day"],
    kind: "imp",
    photo: PHOTOS.implement,
    photoMobile: PHOTOS.implementMobile,
    pos: "center 35%",
    alt: "A Capabble trainer guides a teacher on a laptop while other teachers practise in a bright computer lab",
    vTitle: "Go-live checklist",
    vMeta: "Target: Monday 3 November",
    vBadge: "On track",
    vTone: "success",
  },
  {
    n: "04",
    icon: "shield-check",
    title: "Maintain",
    text: "Updates, monitoring and support, so the system keeps working as your institution grows.",
    points: ["24/7 monitoring and daily backups", "Support by phone, WhatsApp and email", "New features every month"],
    kind: "mnt",
    photo: PHOTOS.maintain,
    photoMobile: PHOTOS.maintainMobile,
    pos: "center 40%",
    alt: "A Capabble support specialist wearing a headset smiles as she helps a school on a call",
    vTitle: "System status",
    vMeta: "Updated 2 minutes ago",
    vBadge: "All systems normal",
    vTone: "success",
  },
];

export const devPlan: { icon: IconName; ink: string; label: string; when: string }[] = [
  { icon: "circle-check", ink: "var(--success)", label: "Requirements workshop", when: "Done" },
  { icon: "circle-check", ink: "var(--success)", label: "Fee rules and report-card format", when: "Done" },
  { icon: "hourglass", ink: "var(--accent-strong)", label: "Parent app with school branding", when: "This week" },
  { icon: "clock", ink: "var(--ink-subtle)", label: "Review with leadership", when: "24 Oct" },
];

export const licFacts = [
  { v: "2", l: "Campuses" },
  { v: "16", l: "Modules" },
  { v: "∞", l: "Logins" },
];

export const impSteps: {
  icon: IconName;
  label: string;
  when: string;
  sub: string;
  dotBg: string;
  dotInk: string;
  line: string;
  showBar: boolean;
}[] = [
  { icon: "check", label: "Data migration", when: "Done", sub: "12,480 student and fee records imported", dotBg: "var(--success)", dotInk: "var(--on-accent)", line: "var(--success)", showBar: false },
  { icon: "check", label: "Configuration", when: "Done", sub: "Classes, timetable, fee heads and transport routes", dotBg: "var(--success)", dotInk: "var(--on-accent)", line: "var(--accent-strong)", showBar: false },
  { icon: "users", label: "Staff training", when: "In progress", sub: "Office, teachers and leadership, by role", dotBg: "var(--accent-strong)", dotInk: "var(--on-accent)", line: "var(--border-strong)", showBar: true },
  { icon: "flag", label: "Go-live", when: "3 Nov", sub: "Our team on site from 7:30 am", dotBg: "var(--surface-sunken)", dotInk: "var(--ink-muted)", line: "transparent", showBar: false },
];

export const uptime = Array.from({ length: 30 }, (_, k) => {
  const dip = k === 11;
  return { h: dip ? "62%" : `${88 + ((k * 7) % 12)}%`, c: dip ? "var(--warning)" : "var(--success)" };
});

export const erpBars = [
  { m: "May", h: "38%", c: "var(--accent-soft)" },
  { m: "Jun", h: "52%", c: "var(--accent-soft)" },
  { m: "Jul", h: "64%", c: "var(--accent-soft)" },
  { m: "Aug", h: "58%", c: "var(--accent-soft)" },
  { m: "Sep", h: "76%", c: "var(--accent-soft)" },
  { m: "Oct", h: "92%", c: "var(--accent-strong)" },
];

export const implMini: { icon: IconName; label: string; when: string; bg: string; ink: string }[] = [
  { icon: "check", label: "Data migration", when: "Done", bg: "var(--success)", ink: "var(--on-accent)" },
  { icon: "check", label: "Configuration", when: "Done", bg: "var(--success)", ink: "var(--on-accent)" },
  { icon: "users", label: "Staff training", when: "42 of 56", bg: "var(--accent-strong)", ink: "var(--on-accent)" },
  { icon: "flag", label: "Go-live", when: "3 Nov", bg: "var(--surface-sunken)", ink: "var(--ink-muted)" },
];

export const itTop: { icon: IconName; label: string; col: string }[] = [
  { icon: "globe", label: "School website", col: "1" },
  { icon: "credit-card", label: "Payment gateway", col: "3" },
];
export const itBottom: { icon: IconName; label: string; col: string }[] = [
  { icon: "message-circle", label: "WhatsApp", col: "1" },
  { icon: "chart-column", label: "Tally", col: "3" },
];
