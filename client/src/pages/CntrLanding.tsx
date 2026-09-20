import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { Document, Page, pdfjs } from 'react-pdf'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import {
  Calendar,
  FileText,
  Building2,
  FileStack,
  LayoutGrid,
  Users,
  ClipboardCheck,
  UserCheck,
  CheckCircle2,
  Eye,
  Copyright,
  Heart,
} from 'lucide-react'
import capabbleMark from '../assets/capabble-mark.svg'
import dashboardPreview from '../assets/dashboard.png'
import dashboardPreview2 from '../assets/dashboard2.png'

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

const PREVIEW_PDF_URL = `${import.meta.env.BASE_URL}Preview.pdf`

const modules = [
  {
    title: 'Centre Datesheet',
    description: 'Automatically generate centre-specific exam schedules using official LOC data.',
    bullets: ['Auto generate schedule', 'Accurate subject mapping', 'Export printable plan'],
    icon: Calendar,
    iconBg: 'bg-blue-100',
    iconColor: 'text-blue-600',
  },
  {
    title: 'Form-66',
    description: 'Generate official Form-66 instantly with verified candidate and centre details.',
    bullets: ['Auto Datewise Slpit', 'No manual typing & formatting', 'Ready to Print format'],
    icon: FileText,
    iconBg: 'bg-purple-100',
    iconColor: 'text-purple-600',
  },
  {
    title: 'Exam Rooms',
    description: 'Manage and assign exam rooms effectively with detailed capacity planning and resource allocation.',
    bullets: ['Optimize room utilization', 'Real-time availability', 'Assign resources easily'],
    icon: Building2,
    iconBg: 'bg-teal-100',
    iconColor: 'text-teal-600',
  },
  {
    title: 'Answer Sheets',
    description: 'Track answer sheets used across different examination days and subjects.',
    bullets: ['Organized sheet records', 'Track exam day usage', 'Quick verification'],
    icon: FileStack,
    iconBg: 'bg-orange-100',
    iconColor: 'text-orange-600',
  },
  {
    title: 'Seating Plan',
    description: 'Generate seating arrangements automatically for multiple exam rooms.',
    bullets: ['Instant seating generation', 'Supports multiple rooms', 'Printable layouts'],
    icon: LayoutGrid,
    iconBg: 'bg-emerald-100',
    iconColor: 'text-emerald-600',
  },
  {
    title: 'Functionary Duties',
    description: 'Automatically assign invigilators and exam staff based on exam schedule.',
    bullets: ['Smart duty allocation', 'Balanced invigilators', 'Avoid manual conflicts'],
    icon: Users,
    iconBg: 'bg-amber-100',
    iconColor: 'text-amber-600',
  },
  {
    title: 'Attendance',
    description: 'Monitor candidate attendance during exams and generate reports instantly.',
    bullets: ['Track student presence', 'Instant attendance reports', 'Avoid manual conflicts'],
    icon: ClipboardCheck,
    iconBg: 'bg-blue-100',
    iconColor: 'text-blue-600',
  },
  {
    title: 'Candidates',
    description: 'Monitor candidate registrations, manage profiles, and track examination history efficiently.',
    bullets: ['Centralized candidate profiles', 'Filter by subject or school', 'Easy candidate search'],
    icon: UserCheck,
    iconBg: 'bg-violet-100',
    iconColor: 'text-violet-600',
  },
]

const CntrLanding: React.FC = () => {
  const [showPreviewDialog, setShowPreviewDialog] = useState(false)
  const [previewPageCount, setPreviewPageCount] = useState(0)
  const [previewRenderError, setPreviewRenderError] = useState<string | null>(null)

  const openPreviewDialog = () => {
    setPreviewPageCount(0)
    setPreviewRenderError(null)
    setShowPreviewDialog(true)
  }

  const closePreviewDialog = () => {
    setShowPreviewDialog(false)
    setPreviewPageCount(0)
    setPreviewRenderError(null)
  }

  return (
    <div className="min-h-screen w-full bg-slate-50 text-slate-900">
      <section className="border-b border-slate-200/80 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
          <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-12">
            <div>
              <div className="flex items-center gap-3 sm:gap-4">
                <img
                  src={capabbleMark}
                  alt="capabble"
                  className="h-14 w-14 shrink-0 drop-shadow-sm sm:h-16 sm:w-16"
                />
                <div>
                  <p className="text-4xl font-black tracking-tight text-[#1a3a8a] sm:text-5xl">
                    capabble
                  </p>
                  <p className="mt-1 text-sm font-semibold tracking-[0.12em] text-sky-700 sm:text-base">
                    Exam Centre Control
                  </p>
                </div>
              </div>
              <h1 className="mt-8 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
                Control The Entire Examination Process Effortlessly
              </h1>
              <h2 className="mt-4 max-w-xl text-base text-slate-600 sm:text-lg">
                Manage datesheets, rooms, answer sheets, seating plans, invigilator duties, attendance and candidate records.
              </h2>
              <div className="mt-8 flex flex-wrap items-center gap-4">
                <button
                  type="button"
                  onClick={openPreviewDialog}
                  className="inline-flex items-center justify-center rounded-xl bg-emerald-500 px-6 py-3.5 text-sm font-semibold text-white shadow-md transition-colors hover:bg-emerald-600"
                >
                  <Eye className="mr-2 h-4 w-4" />
                  Preview
                </button>
              </div>
            </div>

            <div className="flex items-center justify-center lg:justify-end">
              <img
                src={dashboardPreview}
                alt="capabble dashboard preview"
                className="block h-auto w-full max-w-3xl"
              />
            </div>
          </div>
        </div>
      </section>

      <section className="bg-gradient-to-b from-sky-50/50 via-white to-violet-50/30 py-16 lg:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="mb-12 text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-500">
              Modules
            </p>
            <h2 className="mt-2 text-2xl font-bold text-slate-900 sm:text-3xl">
              Powerful Modules Designed for Examination Centres
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-sm text-slate-600 sm:text-base">
              Everything a centre controller needs on exam day - from room allocation to answer sheets -
              organised into focused, easy-to-use workspaces.
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
            Run the exam centre smoothly and efficiently.
          </h2>
          <ul className="mb-14 flex flex-wrap justify-center gap-x-8 gap-y-3 text-slate-600">
            <li className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 flex-shrink-0 text-emerald-500" />
              Automatic exam planning
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 flex-shrink-0 text-emerald-500" />
              Zero manual paperwork
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 flex-shrink-0 text-emerald-500" />
              Fast room allocation
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 flex-shrink-0 text-emerald-500" />
              Accurate exam monitoring
            </li>
          </ul>

          <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-12">
            <div className="flex items-center justify-center lg:justify-start">
              <img
                src={dashboardPreview2}
                alt="capabble room allocation preview"
                className="block h-auto w-full max-w-md"
              />
            </div>

            <div className="text-center lg:text-left">
              <h3 className="text-xl font-bold text-slate-900 sm:text-2xl">
                Ready to Manage Your Examination Centre Efficiently?
              </h3>
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
          <span>{new Date().getFullYear()} capabble — Exam Centre Control.</span>
          <span>Designed &amp; Developed with</span>
          <Heart className="h-4 w-4 fill-red-500 text-red-500" />
          <span>in Bharat.</span>
        </span>
      </footer>

      {showPreviewDialog && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
          <div className="flex h-[88vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
              <h4 className="text-sm font-semibold text-gray-900">
                Product Preview PDF
              </h4>
              <div className="flex items-center gap-2">
                <a
                  href={PREVIEW_PDF_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center rounded-md border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-100"
                >
                  Open in New Tab
                </a>
                <a
                  href={PREVIEW_PDF_URL}
                  download="Preview.pdf"
                  className="inline-flex items-center rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
                >
                  Download PDF
                </a>
                <button
                  type="button"
                  onClick={closePreviewDialog}
                  className="inline-flex items-center rounded-md border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-100"
                >
                  Close
                </button>
              </div>
            </div>
            <div className="w-full flex-1 overflow-auto bg-gray-100 p-4">
              {previewRenderError ? (
                <div className="flex h-full w-full items-center justify-center p-6 text-center text-sm text-gray-600">
                  {previewRenderError}
                </div>
              ) : (
                <Document
                  file={PREVIEW_PDF_URL}
                  loading={
                    <div className="flex h-full w-full items-center justify-center text-sm text-gray-600">
                      Loading PDF preview...
                    </div>
                  }
                  onLoadSuccess={({ numPages }) => {
                    setPreviewPageCount(numPages)
                    setPreviewRenderError(null)
                  }}
                  onLoadError={(error) => {
                    console.error('Failed to render landing page preview:', error)
                    const message = (error as Error)?.message || 'Unknown PDF render error'
                    setPreviewRenderError(`Failed to render preview in dialog (${message}). Use "Open in New Tab" or "Download PDF".`)
                  }}
                  className="flex flex-col items-center gap-4"
                >
                  {Array.from({ length: previewPageCount }).map((_, index) => (
                    <Page
                      key={`landing-preview-page-${index + 1}`}
                      pageNumber={index + 1}
                      width={980}
                      renderTextLayer={false}
                      renderAnnotationLayer={false}
                    />
                  ))}
                </Document>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default CntrLanding
