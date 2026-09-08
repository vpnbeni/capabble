import type { ProfileHeader } from '@/types/profile'
import { BadgeCheck, Download, MoreHorizontal, Star } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'

function displayId(value: string | null | undefined, fallback = 'Not found') {
  return value || fallback
}

export function ProfileHeaderCard({
  header,
  onExport,
  onViewRaw,
}: {
  header: ProfileHeader
  onExport: () => void
  onViewRaw: () => void
}) {
  const { canExport, canViewRaw, canAddProspect } = useAuth()

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-primary-700">{header.name}</h1>
            <BadgeCheck className="h-5 w-5 text-primary-600" />
          </div>
          <p className="text-slate-600">{header.location}</p>
          <div className="flex flex-wrap gap-2">
            {[header.management, header.school_type, header.board, header.status].map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700"
              >
                {tag}
              </span>
            ))}
          </div>
          <div className="grid gap-2 text-sm text-slate-600 sm:grid-cols-2 lg:grid-cols-3">
            <div>UDISE: <span className="font-medium text-slate-900">{displayId(header.identifiers.udise, 'Not available')}</span></div>
            <div>Haryana School Code: <span className="font-medium text-slate-900">{displayId(header.identifiers.state_school_code, 'Not available')}</span></div>
            <div>KYS School ID: <span className="font-medium text-slate-900">{displayId(header.identifiers.kys_school_id, 'Not available')}</span></div>
            <div>CBSE Affiliation: <span className="font-medium text-slate-900">{displayId(header.identifiers.cbse_affiliation, 'Not found')}</span></div>
            <div>Established: <span className="font-medium text-slate-900">{header.established ?? 'Not available'}</span></div>
            <div>Classes: <span className="font-medium text-slate-900">{header.classes}</span></div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {canAddProspect && (
            <button className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700">
              <Star className="h-4 w-4" />
              Add to Prospects
            </button>
          )}
          {canExport && (
            <button
              onClick={onExport}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <Download className="h-4 w-4" />
              Export
            </button>
          )}
          {canViewRaw && (
            <button
              onClick={onViewRaw}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              View Raw Data
            </button>
          )}
          <button className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
