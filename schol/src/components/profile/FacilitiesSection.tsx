import { useState } from 'react'
import type { FacilityHistoryRow, FacilityItem } from '@/types/profile'
import { ChevronDown, ChevronRight } from 'lucide-react'

export function FacilitiesSection({
  facilities,
  facilityHistory,
}: {
  facilities: FacilityItem[]
  facilityHistory: Record<string, FacilityHistoryRow[]>
}) {
  const [expanded, setExpanded] = useState<string | null>(null)

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {facilities.map((facility) => (
          <div key={`${facility.key}-${facility.year}`} className="rounded-lg border border-slate-200 p-3">
            <div className="text-xs uppercase tracking-wide text-slate-500">{facility.label}</div>
            <div className="mt-1 font-semibold text-slate-900">
              {formatFacilityValue(facility.value)}
            </div>
          </div>
        ))}
        {!facilities.length && (
          <div className="text-sm text-slate-500">Facility data unavailable for selected year.</div>
        )}
      </div>

      <div className="space-y-2">
        <h4 className="font-medium text-slate-900">Facility history</h4>
        {Object.entries(facilityHistory).map(([label, rows]) => (
          <div key={label} className="rounded-lg border border-slate-200">
            <button
              type="button"
              onClick={() => setExpanded(expanded === label ? null : label)}
              className="flex w-full items-center justify-between px-4 py-3 text-left"
            >
              <span className="font-medium">{label}</span>
              {expanded === label ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
            {expanded === label && (
              <div className="border-t border-slate-100 px-4 py-3">
                <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-4">
                  {rows.map((row) => (
                    <div key={row.year} className="rounded bg-slate-50 px-3 py-2 text-sm">
                      <div className="text-slate-500">{row.year}</div>
                      <div className="font-medium">{row.value}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function formatFacilityValue(value: unknown) {
  if (value == null) return 'Not reported'
  if (typeof value === 'string') {
    if (value.includes('1-Yes')) return 'Yes'
    if (value.includes('2-No')) return 'No'
    return value
  }
  return String(value)
}
