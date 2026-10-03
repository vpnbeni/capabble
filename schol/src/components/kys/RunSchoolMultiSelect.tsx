import { useMemo, useState } from 'react'
import type { CollectionRunSchoolStatus } from '@/types/collection'

export interface RunSchoolMultiSelectProps {
  schools: CollectionRunSchoolStatus[]
  selected: string[]
  onChange: (ids: string[]) => void
}

export function RunSchoolMultiSelect({ schools, selected, onChange }: RunSchoolMultiSelectProps) {
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return schools
    return schools.filter((s) =>
      [s.school_name, s.affiliation_number, s.district || '', s.school_code || '']
        .join(' ')
        .toLowerCase()
        .includes(q),
    )
  }, [schools, query])

  const selectedSet = new Set(selected)

  function toggle(id: string) {
    onChange(selectedSet.has(id) ? selected.filter((s) => s !== id) : [...selected, id])
  }

  function selectAllFiltered() {
    const ids = new Set(selected)
    filtered.forEach((s) => ids.add(s.school_id as string))
    onChange([...ids])
  }

  function clearSelection() {
    onChange([])
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by school name, district or code..."
          className="w-full max-w-sm rounded-lg border border-slate-200 px-3 py-2 text-sm"
        />
        <button
          type="button"
          onClick={selectAllFiltered}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium hover:bg-slate-50"
        >
          Select all filtered ({filtered.length})
        </button>
        {selected.length > 0 && (
          <button
            type="button"
            onClick={clearSelection}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
          >
            Clear ({selected.length} selected)
          </button>
        )}
      </div>

      <div className="max-h-72 overflow-y-auto rounded-lg border border-slate-200">
        {filtered.length === 0 ? (
          <div className="p-4 text-center text-sm text-slate-500">No schools match this search.</div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {filtered.map((school) => (
              <li key={school.id} className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={selectedSet.has(school.school_id as string)}
                  onChange={() => toggle(school.school_id as string)}
                />
                <div>
                  <div className="font-medium text-slate-900">{school.school_name}</div>
                  <div className="text-xs text-slate-500">
                    {school.district || '—'} · Affiliation {school.affiliation_number}
                    {school.kys_mapping_status ? ` · KYS: ${school.kys_mapping_status}` : ''}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
