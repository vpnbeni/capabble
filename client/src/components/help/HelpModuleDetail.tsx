import React from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowLeft,
  ChevronRight,
  MessageSquarePlus,
  Star,
} from 'lucide-react'
import type { HelpModuleCard } from '@/constants/helpCentreCatalog'
import type { SupportModuleOption } from '@/constants/supportCatalog'

type HelpModuleDetailProps = {
  module: HelpModuleCard
  supportModule?: SupportModuleOption
  onBack: () => void
  onReportIssue: () => void
  onShareFeedback: () => void
}

const HelpModuleDetail: React.FC<HelpModuleDetailProps> = ({
  module,
  supportModule,
  onBack,
  onReportIssue,
  onShareFeedback,
}) => {
  const Icon = module.LucideIcon
  const pages = supportModule?.pages.filter((page) => page.label !== 'Other / General') || []

  return (
    <section className="help-detail-enter rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm sm:p-6">
      <button
        type="button"
        onClick={onBack}
        className="mb-4 inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 transition hover:text-violet-600"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to all modules
      </button>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ring-1 ${module.iconBg}`}>
            {module.icon ? (
              <img src={module.icon} alt="" className="h-9 w-9 object-contain" />
            ) : Icon ? (
              <Icon className="h-7 w-7" strokeWidth={1.75} />
            ) : null}
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-violet-600">{module.abbreviation}</p>
            <h2 className="text-xl font-bold text-slate-900">{module.title}</h2>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-slate-500">{module.description}</p>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          <button
            type="button"
            onClick={onReportIssue}
            className="inline-flex items-center gap-1.5 rounded-xl bg-violet-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-violet-700"
          >
            <MessageSquarePlus className="h-3.5 w-3.5" />
            Report an Issue
          </button>
          <button
            type="button"
            onClick={onShareFeedback}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition hover:border-violet-200 hover:bg-violet-50 hover:text-violet-700"
          >
            <Star className="h-3.5 w-3.5" />
            Share Feedback
          </button>
        </div>
      </div>

      {pages.length > 0 ? (
        <div className="mt-6">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Pages in this module</h3>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {pages.map((page) =>
              page.path ? (
                <Link
                  key={page.id}
                  to={page.path}
                  className="group flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3 text-sm transition hover:border-violet-200 hover:bg-violet-50/50"
                >
                  <span className="font-medium text-slate-800 group-hover:text-violet-700">{page.label}</span>
                  <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-violet-500" />
                </Link>
              ) : (
                <div
                  key={page.id}
                  className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/40 px-4 py-3 text-sm text-slate-500"
                >
                  {page.label}
                </div>
              )
            )}
          </div>
        </div>
      ) : (
        <div className="mt-6 rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-4 py-5 text-sm text-slate-500">
          No pages are currently active for this module on your account. You can still report a general issue using
          the button above.
        </div>
      )}
    </section>
  )
}

export default HelpModuleDetail
