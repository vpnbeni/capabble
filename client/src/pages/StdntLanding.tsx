import React from 'react'
import { useLightOnlyTheme } from '@/utils/theme'
import { Link } from 'react-router-dom'
import {
  BookOpen,
  CheckCircle2,
  Copyright,
  FileText,
  Heart,
  Layers3,
  MessageSquare,
  PhoneCall,
  ScanSearch,
  ShieldCheck,
  UserCircle2,
  Users,
} from 'lucide-react'

const modules = [
  {
    title: 'Student Profiles',
    description: 'Keep every learner record organized with identity, class, section, and guardian-linked details in one place.',
    bullets: ['Profile-level student records', 'Class and section organization', 'Guardian contact visibility'],
    icon: UserCircle2,
    iconBg: 'bg-sky-100',
    iconColor: 'text-sky-700',
  },
  {
    title: 'Admissions & Roll Numbers',
    description: 'Simplify onboarding with structured entry workflows and predictable roll-number generation by class and section.',
    bullets: ['Admission-ready entries', 'Next roll number generation', 'Cleaner record creation'],
    icon: ShieldCheck,
    iconBg: 'bg-violet-100',
    iconColor: 'text-violet-700',
  },
  {
    title: 'Class-Wise Views',
    description: 'Move from broad student lists to class and section-specific views without losing speed or consistency.',
    bullets: ['Filter by class instantly', 'Section-wise student access', 'Better classroom visibility'],
    icon: Layers3,
    iconBg: 'bg-emerald-100',
    iconColor: 'text-emerald-700',
  },
  {
    title: 'Subject Mapping',
    description: 'Link students to subjects so academic and exam workflows stay grounded in accurate enrollment data.',
    bullets: ['Subject-linked records', 'Enrollment-aware operations', 'Less manual reconciliation'],
    icon: BookOpen,
    iconBg: 'bg-amber-100',
    iconColor: 'text-amber-700',
  },
  {
    title: 'Bulk Student Import',
    description: 'Bring large student sets into the system quickly when sessions, classes, or schools need to be onboarded in batches.',
    bullets: ['Bulk creation workflow', 'Faster setup for new sessions', 'Less repetitive entry work'],
    icon: Users,
    iconBg: 'bg-blue-100',
    iconColor: 'text-blue-700',
  },
  {
    title: 'Documents & Records',
    description: 'Store student-linked documents in the same workspace where teams manage profiles and updates.',
    bullets: ['Document attachments', 'Centralized student records', 'Reduced file chasing'],
    icon: FileText,
    iconBg: 'bg-rose-100',
    iconColor: 'text-rose-700',
  },
  {
    title: 'Search & Retrieval',
    description: 'Find students faster with cleaner list views and targeted retrieval by class, section, or subject context.',
    bullets: ['Quick student lookup', 'Focused retrieval routes', 'Operationally useful filters'],
    icon: ScanSearch,
    iconBg: 'bg-cyan-100',
    iconColor: 'text-cyan-700',
  },
  {
    title: 'Communication Readiness',
    description: 'Keep contact information visible so schools can respond faster when operations depend on student and family coordination.',
    bullets: ['Guardian phone visibility', 'Cleaner contact readiness', 'Better school communication flow'],
    icon: PhoneCall,
    iconBg: 'bg-fuchsia-100',
    iconColor: 'text-fuchsia-700',
  },
] as const

const benefits = [
  'One place for student records',
  'Class-wise and subject-wise retrieval',
  'Faster onboarding and updates',
  'Cleaner academic and exam readiness',
] as const

const profileStats = [
  { label: 'Students', value: '2,480', accent: 'bg-sky-500' },
  { label: 'Classes', value: '38', accent: 'bg-emerald-500' },
  { label: 'Sections', value: '94', accent: 'bg-violet-500' },
] as const

const studentRows = [
  { name: 'Aarav Mehta', roll: 'IX-A-017', classInfo: 'Class IX • Section A', status: 'Verified' },
  { name: 'Myra Singh', roll: 'VIII-C-011', classInfo: 'Class VIII • Section C', status: 'Documents complete' },
  { name: 'Kabir Nanda', roll: 'XI-B-023', classInfo: 'Class XI • Section B', status: 'Subject mapped' },
] as const

const HeroPreview: React.FC = () => {
  return (
    <div className="relative w-full max-w-3xl overflow-hidden rounded-[30px] border border-slate-200 bg-slate-950 p-5 text-white shadow-2xl shadow-slate-900/20">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.30),_transparent_34%),radial-gradient(circle_at_bottom_right,_rgba(168,85,247,0.24),_transparent_32%)]" />
      <div className="relative">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-200">Student Workspace</p>
            <h3 className="mt-2 text-2xl font-semibold">Profiles, records, and readiness</h3>
          </div>
          <div className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-medium text-slate-100">
            Stdnt workspace
          </div>
        </div>

        <div className="mt-6 rounded-[26px] border border-white/10 bg-white/6 p-4 backdrop-blur">
          <div className="grid gap-3 sm:grid-cols-3">
            {profileStats.map((stat) => (
              <div key={stat.label} className="rounded-2xl border border-white/10 bg-slate-900/55 p-4">
                <div className="flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full ${stat.accent}`} />
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">{stat.label}</p>
                </div>
                <p className="mt-3 text-3xl font-bold text-white">{stat.value}</p>
              </div>
            ))}
          </div>

          <div className="mt-4 space-y-3">
            {studentRows.map((student) => (
              <div key={student.roll} className="rounded-2xl border border-white/10 bg-white/8 px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-white">{student.name}</p>
                    <p className="mt-1 text-sm text-slate-300">{student.classInfo}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-slate-100">
                      {student.roll}
                    </span>
                    <span className="rounded-full bg-emerald-400/20 px-3 py-1 text-xs font-semibold text-emerald-100">
                      {student.status}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-white/6 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-200">Operational Ready</p>
            <div className="mt-3 flex items-center gap-2 text-sm text-slate-200">
              <CheckCircle2 className="h-4 w-4 text-emerald-300" />
              Class and section retrieval available
            </div>
            <div className="mt-2 flex items-center gap-2 text-sm text-slate-200">
              <CheckCircle2 className="h-4 w-4 text-emerald-300" />
              Guardian-linked contact records visible
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/6 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-200">Data Quality</p>
            <div className="mt-3 flex items-center gap-2 text-sm text-slate-200">
              <ShieldCheck className="h-4 w-4 text-sky-300" />
              Duplicate-sensitive record workflows
            </div>
            <div className="mt-2 flex items-center gap-2 text-sm text-slate-200">
              <ShieldCheck className="h-4 w-4 text-sky-300" />
              Structured records for academic operations
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

const OperationsPreview: React.FC = () => {
  return (
    <div className="relative mx-auto w-full max-w-xl overflow-hidden rounded-[30px] border border-slate-200 bg-white p-5 shadow-xl shadow-slate-900/10">
      <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-r from-sky-100 via-white to-violet-100" />
      <div className="relative">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-600">Student Operations</p>
            <h3 className="mt-2 text-xl font-semibold text-slate-900">One view for student readiness</h3>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white">
            <MessageSquare className="h-3.5 w-3.5" />
            School-ready
          </div>
        </div>

        <div className="mt-6 space-y-3">
          {[
            'Class-wise student lists stay organized for daily operations',
            'Subject-linked records improve academic and exam coordination',
            'Documents and contact details remain attached to the student record',
          ].map((line) => (
            <div key={line} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-500" />
                <span>{line}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

const StdntLanding: React.FC = () => {
  useLightOnlyTheme()
  return (
    <div className="min-h-screen w-full bg-slate-50 text-slate-900">
      <section className="border-b border-slate-200/80 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
          <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-12">
            <div>
              <div className="inline-flex items-center gap-3 rounded-full border border-slate-200 bg-white px-4 py-2 shadow-sm">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-600 text-white shadow-lg shadow-sky-600/20">
                  <UserCircle2 className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-lg font-bold tracking-tight text-slate-900">Stdnt</p>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-700">Capabble</p>
                </div>
              </div>

              <p className="mt-6 text-lg font-semibold tracking-[0.08em] text-sky-700 sm:text-xl">
                Student Information Management
              </p>
              <h1 className="mt-8 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
                Keep student records ready for school operations, not buried in scattered files.
              </h1>
              <h2 className="mt-4 max-w-xl text-base text-slate-600 sm:text-lg">
                Manage profiles, admissions, class-wise retrieval, subject mapping, bulk onboarding, documents, and contact readiness in one focused workspace.
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

      <section id="modules" className="bg-gradient-to-b from-sky-50/70 via-white to-violet-50/35 py-16 lg:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="mb-12 text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-500">
              Modules
            </p>
            <h2 className="mt-2 text-2xl font-bold text-slate-900 sm:text-3xl">
              Student data workflows in one connected workspace
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-sm text-slate-600 sm:text-base">
              Move from profile setup to class retrieval, document handling, and communication readiness without rebuilding student records across separate tools.
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
            Run student operations with cleaner records and faster retrieval.
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
                Ready to organize student data in one place?
              </h3>
              <p className="mt-4 text-sm text-slate-600 sm:text-base">
                Give school teams a cleaner way to manage profiles, class lists, subject links, and student communication without spreadsheet sprawl.
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
          <span>{new Date().getFullYear()} Stdnt - Student Information Management. Powered by Capabble.</span>
          <span>Designed &amp; Developed with</span>
          <Heart className="h-4 w-4 fill-red-500 text-red-500" />
          <span>in Bharat.</span>
        </span>
      </footer>
    </div>
  )
}

export default StdntLanding
