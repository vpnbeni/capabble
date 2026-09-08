import clsx from 'clsx'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { ReactNode } from 'react'

interface ExpandableSectionProps {
  id: string
  title: string
  subtitle?: string
  expanded: boolean
  onToggle: () => void
  children: ReactNode
  badge?: string
}

export function ExpandableSection({
  id,
  title,
  subtitle,
  expanded,
  onToggle,
  children,
  badge,
}: ExpandableSectionProps) {
  return (
    <section id={id} className="scroll-mt-28 rounded-xl border border-slate-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-start justify-between gap-4 px-5 py-4 text-left"
      >
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
            {badge && (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                {badge}
              </span>
            )}
          </div>
          {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
        </div>
        {expanded ? (
          <ChevronDown className="mt-1 h-5 w-5 shrink-0 text-slate-400" />
        ) : (
          <ChevronRight className="mt-1 h-5 w-5 shrink-0 text-slate-400" />
        )}
      </button>
      <div className={clsx('border-t border-slate-100 px-5 py-4', !expanded && 'hidden')}>{children}</div>
    </section>
  )
}
