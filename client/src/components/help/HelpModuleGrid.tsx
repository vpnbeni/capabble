import React from 'react'
import { ChevronRight } from 'lucide-react'
import type { HelpModuleCard } from '@/constants/helpCentreCatalog'

type HelpModuleGridProps = {
  modules: Array<HelpModuleCard & { enabled: boolean }>
  selectedModuleId: string | null
  onSelectModule: (moduleId: string) => void
}

const HelpModuleGrid: React.FC<HelpModuleGridProps> = ({ modules, selectedModuleId, onSelectModule }) => {
  if (modules.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-white/70 p-8 text-center text-sm text-slate-500">
        No modules match your search. Try a different keyword or clear the search.
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {modules.map((mod) => {
        const disabled = mod.comingSoon || !mod.enabled
        const isActive = selectedModuleId === mod.id
        const Icon = mod.LucideIcon

        return (
          <button
            key={mod.id}
            type="button"
            disabled={disabled}
            onClick={() => !disabled && onSelectModule(mod.id)}
            className={[
              'help-module-card group relative flex flex-col rounded-2xl border border-slate-200/90 bg-white p-4 text-left',
              disabled ? 'help-module-card--disabled cursor-not-allowed opacity-60' : 'cursor-pointer',
              isActive ? 'help-module-card--active' : '',
            ].join(' ')}
          >
            <div className="flex items-start gap-3">
              <div
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ring-1 ${mod.iconBg}`}
              >
                {mod.icon ? (
                  <img src={mod.icon} alt="" className="h-7 w-7 object-contain" />
                ) : Icon ? (
                  <Icon className="h-5 w-5" strokeWidth={1.75} />
                ) : null}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-wide text-violet-600">
                    {mod.abbreviation}
                  </span>
                  {mod.comingSoon ? (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                      Coming soon
                    </span>
                  ) : !mod.enabled ? (
                    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                      Not activated
                    </span>
                  ) : null}
                </div>
                <p className="mt-0.5 text-sm font-semibold text-slate-900">{mod.title}</p>
              </div>
            </div>

            <p className="mt-3 line-clamp-2 flex-1 text-xs leading-relaxed text-slate-500">{mod.description}</p>

            <div className="mt-3 flex items-center justify-end">
              <span
                className={`inline-flex items-center gap-0.5 text-xs font-medium ${
                  disabled ? 'text-slate-300' : 'text-violet-600 group-hover:gap-1'
                } transition-all`}
              >
                Browse
                <ChevronRight className="h-3.5 w-3.5" />
              </span>
            </div>
          </button>
        )
      })}
    </div>
  )
}

export default HelpModuleGrid
