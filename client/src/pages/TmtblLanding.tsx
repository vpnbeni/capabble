import React from 'react'
import { useLightOnlyTheme } from '@/utils/theme'
import { Link } from 'react-router-dom'
import {
  Building2,
  Calendar,
  CheckCircle2,
  ClipboardCheck,
  Copyright,
  FileText,
  Heart,
  LayoutGrid,
  Sparkles,
  UserCheck,
  Users,
} from 'lucide-react'

const modules = [
  {
    title: 'Classes & Sections',
    description: 'Set up class groups and sections once so timetable planning starts from a clean academic structure.',
    bullets: ['Class-section setup', 'Ready for subject mapping', 'Keeps scheduling organized'],
    icon: LayoutGrid,
    iconBg: 'bg-sky-100',
    iconColor: 'text-sky-600',
  },
  {
    title: 'Subjects',
    description: 'Create a reusable subject catalog for timetable generation, workload planning, and slot balancing.',
    bullets: ['One source of truth', 'Subject-wise planning', 'Aligned with weekly load'],
    icon: FileText,
    iconBg: 'bg-violet-100',
    iconColor: 'text-violet-600',
  },
  {
    title: 'Departments',
    description: 'Map teachers to subjects and classes so each department has clear ownership before scheduling starts.',
    bullets: ['Teacher-subject mapping', 'Department workload view', 'Cleaner responsibility split'],
    icon: Building2,
    iconBg: 'bg-emerald-100',
    iconColor: 'text-emerald-600',
  },
  {
    title: 'Bell Timings',
    description: 'Configure periods, breaks, and day timing patterns that the full timetable follows automatically.',
    bullets: ['Period and break setup', 'School-wide timing rules', 'Easy timetable updates'],
    icon: Calendar,
    iconBg: 'bg-amber-100',
    iconColor: 'text-amber-600',
  },
  {
    title: 'Class Wise Timetable',
    description: 'Build and review weekly schedules by class with a focused view of every period in the week.',
    bullets: ['Week-grid planning', 'Clear subject slots', 'Fast class-level edits'],
    icon: LayoutGrid,
    iconBg: 'bg-blue-100',
    iconColor: 'text-blue-600',
  },
  {
    title: 'Teacher Wise Timetable',
    description: 'See each teacher schedule instantly to balance load, free periods, and cross-class movement.',
    bullets: ['Teacher load visibility', 'Free-period tracking', 'Avoid overlapping assignments'],
    icon: Users,
    iconBg: 'bg-rose-100',
    iconColor: 'text-rose-600',
  },
  {
    title: 'Period Distribution',
    description: 'Compare required and planned periods so every class gets the right subject coverage every week.',
    bullets: ['Target vs planned periods', 'Spot shortages early', 'Balance weekly teaching time'],
    icon: ClipboardCheck,
    iconBg: 'bg-cyan-100',
    iconColor: 'text-cyan-600',
  },
  {
    title: 'Staff Readiness',
    description: 'Keep staffing decisions practical by reviewing teacher allocations before the timetable goes live.',
    bullets: ['Fewer manual clashes', 'Confident publishing', 'Smoother daily operations'],
    icon: UserCheck,
    iconBg: 'bg-fuchsia-100',
    iconColor: 'text-fuchsia-600',
  },
] as const

const benefits = [
  'Conflict-aware weekly planning',
  'Balanced teacher workload',
  'Faster timetable revisions',
  'One place for the full school schedule',
] as const

const heroRows = [
  { label: 'VIII-A', cells: ['Eng', 'Math', 'Sci', 'Break', 'SSt', 'Hindi'] },
  { label: 'IX-B', cells: ['Math', 'Bio', 'Eng', 'Break', 'Chem', 'Games'] },
  { label: 'X-A', cells: ['Phy', 'Math', 'Eng', 'Break', 'CS', 'Chem'] },
] as const

const teacherLoads = [
  { name: 'Anita Sharma', subject: 'Mathematics', load: '34 periods', accent: 'bg-sky-500' },
  { name: 'Rahul Verma', subject: 'English', load: '29 periods', accent: 'bg-emerald-500' },
  { name: 'Neha Iyer', subject: 'Science', load: '31 periods', accent: 'bg-violet-500' },
] as const

const HeroPreview: React.FC = () => {
  return (
    <div className="relative w-full max-w-3xl overflow-hidden rounded-[28px] border border-slate-200 bg-slate-950 p-5 text-white shadow-2xl shadow-slate-900/20">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(56,189,248,0.28),_transparent_36%),radial-gradient(circle_at_bottom_left,_rgba(52,211,153,0.20),_transparent_30%)]" />
      <div className="relative">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-200">Weekly Planner</p>
            <h3 className="mt-2 text-2xl font-semibold">School timetable at a glance</h3>
          </div>
          <div className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-medium text-slate-100">
            Tmtbl workspace
          </div>
        </div>

        <div className="mt-6 rounded-3xl border border-white/10 bg-white/6 p-4 backdrop-blur">
          <div className="grid grid-cols-[92px_repeat(6,minmax(0,1fr))] gap-2 text-[11px] font-medium text-slate-300">
            <div className="rounded-xl bg-white/8 px-3 py-2 text-left">Class</div>
            {['P1', 'P2', 'P3', 'Break', 'P4', 'P5'].map((slot) => (
              <div key={slot} className="rounded-xl bg-white/8 px-3 py-2 text-center">
                {slot}
              </div>
            ))}
          </div>

          <div className="mt-3 space-y-2">
            {heroRows.map((row) => (
              <div key={row.label} className="grid grid-cols-[92px_repeat(6,minmax(0,1fr))] gap-2">
                <div className="rounded-xl bg-slate-900/70 px-3 py-3 text-sm font-semibold text-white">
                  {row.label}
                </div>
                {row.cells.map((cell) => (
                  <div
                    key={`${row.label}-${cell}`}
                    className={`rounded-xl px-3 py-3 text-center text-sm font-medium ${
                      cell === 'Break'
                        ? 'bg-amber-400/20 text-amber-100'
                        : 'bg-white/10 text-slate-100'
                    }`}
                  >
                    {cell}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-white/6 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-200">This Week</p>
            <div className="mt-3 flex items-end gap-3">
              <div>
                <div className="text-3xl font-bold text-white">312</div>
                <div className="text-sm text-slate-300">Scheduled periods</div>
              </div>
              <div className="rounded-full bg-emerald-400/20 px-3 py-1 text-xs font-semibold text-emerald-100">
                0 conflicts
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/6 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-200">Publishing Readiness</p>
            <div className="mt-3 flex items-center gap-2 text-sm text-slate-200">
              <CheckCircle2 className="h-4 w-4 text-emerald-300" />
              Teacher loads balanced across classes
            </div>
            <div className="mt-2 flex items-center gap-2 text-sm text-slate-200">
              <CheckCircle2 className="h-4 w-4 text-emerald-300" />
              Bell timings synced for all sections
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

const OperationsPreview: React.FC = () => {
  return (
    <div className="relative mx-auto w-full max-w-xl overflow-hidden rounded-[28px] border border-slate-200 bg-white p-5 shadow-xl shadow-slate-900/10">
      <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-r from-sky-100 via-white to-emerald-100" />
      <div className="relative">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-600">Teacher View</p>
            <h3 className="mt-2 text-xl font-semibold text-slate-900">Workload overview before publish</h3>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white">
            <Sparkles className="h-3.5 w-3.5" />
            Ready to release
          </div>
        </div>

        <div className="mt-6 space-y-3">
          {teacherLoads.map((teacher) => (
            <div key={teacher.name} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-3">
                    <span className={`h-2.5 w-2.5 rounded-full ${teacher.accent}`} />
                    <p className="truncate text-sm font-semibold text-slate-900">{teacher.name}</p>
                  </div>
                  <p className="mt-1 text-sm text-slate-600">{teacher.subject}</p>
                </div>
                <div className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm">
                  {teacher.load}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

const TmtblLanding: React.FC = () => {
  useLightOnlyTheme()
  return (
    <div className="min-h-screen w-full bg-slate-50 text-slate-900">
      <section className="border-b border-slate-200/80 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
          <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-12">
            <div>
              <div className="inline-flex items-center gap-3 rounded-full border border-slate-200 bg-white px-4 py-2 shadow-sm">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-600 text-white shadow-lg shadow-sky-600/20">
                  <Calendar className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-lg font-bold tracking-tight text-slate-900">Tmtbl</p>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-700">Capabble</p>
                </div>
              </div>

              <p className="mt-6 text-lg font-semibold tracking-[0.08em] text-sky-700 sm:text-xl">
                School Timetable Management
              </p>
              <h1 className="mt-8 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
                Plan school timetables without spreadsheet chaos.
              </h1>
              <h2 className="mt-4 max-w-xl text-base text-slate-600 sm:text-lg">
                Organize classes, subjects, departments, bell timings, class-wise schedules, and teacher loads in one focused workspace.
              </h2>
              <div className="mt-8 flex flex-wrap items-center gap-4">
                <a
                  href="#modules"
                  className="inline-flex items-center justify-center rounded-xl bg-emerald-500 px-6 py-3.5 text-sm font-semibold text-white shadow-md transition-colors hover:bg-emerald-600"
                >
                  Explore Modules
                </a>
                <Link
                  to="/login"
                  className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-6 py-3.5 text-sm font-semibold text-slate-900 shadow-sm transition-colors hover:bg-slate-100"
                >
                  Login
                </Link>
              </div>
            </div>

            <div className="flex items-center justify-center lg:justify-end">
              <HeroPreview />
            </div>
          </div>
        </div>
      </section>

      <section id="modules" className="bg-gradient-to-b from-sky-50/70 via-white to-emerald-50/40 py-16 lg:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="mb-12 text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-500">
              Modules
            </p>
            <h2 className="mt-2 text-2xl font-bold text-slate-900 sm:text-3xl">
              Every timetable task in one connected workflow
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-sm text-slate-600 sm:text-base">
              Move from academic setup to published weekly schedules without hopping across spreadsheets, chats, and handwritten corrections.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {modules.map((mod) => {
              const Icon = mod.icon
              return (
                <article
                  key={mod.title}
                  className="group relative rounded-2xl border border-slate-100 bg-white p-6 shadow-sm transition-all duration-200 hover:shadow-lg"
                >
                  <div className="flex items-start gap-3">
                    <div className={`inline-flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl ${mod.iconBg} ${mod.iconColor}`}>
                      <Icon className="h-6 w-6" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-base font-bold text-slate-900">
                        {mod.title}
                      </h3>
                    </div>
                  </div>
                  <p className="mt-3 text-sm leading-snug text-slate-600">
                    {mod.description}
                  </p>
                  <ul className="mt-4 space-y-2">
                    {mod.bullets.map((bullet) => (
                      <li key={bullet} className="flex items-start gap-2 text-sm text-slate-600">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-500" />
                        <span>{bullet}</span>
                      </li>
                    ))}
                  </ul>
                </article>
              )
            })}
          </div>
        </div>
      </section>

      <section className="border-t border-slate-200 bg-white py-16 lg:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <h2 className="mb-10 text-center text-2xl font-bold text-slate-900 sm:text-3xl">
            Publish a timetable the whole school can rely on.
          </h2>
          <ul className="mb-14 flex flex-wrap justify-center gap-x-8 gap-y-3 text-slate-600">
            {benefits.map((benefit) => (
              <li key={benefit} className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 flex-shrink-0 text-emerald-500" />
                {benefit}
              </li>
            ))}
          </ul>

          <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-12">
            <div className="flex items-center justify-center lg:justify-start">
              <OperationsPreview />
            </div>

            <div className="text-center lg:text-left">
              <h3 className="text-xl font-bold text-slate-900 sm:text-2xl">
                Ready to build your school timetable faster?
              </h3>
              <p className="mt-4 text-sm text-slate-600 sm:text-base">
                Bring class planning, teacher allocation, and weekly schedule visibility into one clean system before the term begins.
              </p>
              <div className="mt-6 flex flex-wrap items-center justify-center gap-4 lg:justify-start">
                <Link
                  to="/login"
                  className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-6 py-3.5 text-sm font-semibold text-white shadow-md transition-colors hover:bg-blue-700"
                >
                  Login
                </Link>
                <Link
                  to="/signup"
                  className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-6 py-3.5 text-sm font-semibold text-white shadow-md transition-colors hover:bg-slate-800"
                >
                  Sign Up
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-200 bg-slate-50 py-6 text-center text-sm text-slate-500">
        <span className="inline-flex flex-wrap items-center justify-center gap-1">
          <Copyright className="h-4 w-4" />
          <span>{new Date().getFullYear()} Tmtbl - School Timetable Management. Powered by Capabble.</span>
          <span>Designed &amp; Developed with</span>
          <Heart className="h-4 w-4 fill-red-500 text-red-500" />
          <span>in Bharat.</span>
        </span>
      </footer>
    </div>
  )
}

export default TmtblLanding
