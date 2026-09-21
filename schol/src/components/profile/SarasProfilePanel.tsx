import type { SarasDetailBlock } from '@/types/profile'
import { displaySarasValue, sarasWebsiteHref } from '@/utils/sarasDisplay'

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-medium text-slate-800">{value}</dd>
    </div>
  )
}

export function SarasProfilePanel({ saras }: { saras: SarasDetailBlock | null | undefined }) {
  if (!saras) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="font-semibold text-slate-900">SARAS Profile</h3>
        <p className="mt-2 text-sm text-slate-500">No SARAS detail record linked to this school.</p>
      </div>
    )
  }

  const websiteHref = sarasWebsiteHref(saras.website)

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="font-semibold text-slate-900">SARAS Profile</h3>
      <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
        <DetailRow label="Principal / Head" value={displaySarasValue(saras.head_name)} />
        <DetailRow label="Principal gender" value={displaySarasValue(saras.principal_gender)} />
        <DetailRow label="Principal qualifications" value={displaySarasValue(saras.principal_qualifications)} />
        <DetailRow label="Administrative experience" value={displaySarasValue(saras.administrative_experience)} />
        <DetailRow label="Teaching experience" value={displaySarasValue(saras.teaching_experience)} />
        <DetailRow label="Year of foundation" value={displaySarasValue(saras.year_of_foundation)} />
        <DetailRow label="First opening date" value={displaySarasValue(saras.first_opening_date)} />
        <DetailRow label="School status" value={displaySarasValue(saras.school_status)} />
        <DetailRow label="School type" value={displaySarasValue(saras.school_type)} />
        <DetailRow label="Affiliation period" value={displaySarasValue(saras.affiliation_period)} />
        <DetailRow label="Managing society / trust" value={displaySarasValue(saras.managing_society)} />
        <DetailRow label="PIN" value={displaySarasValue(saras.pin_code)} />
        <div className="sm:col-span-2">
          <dt className="text-slate-500">Address</dt>
          <dd className="font-medium text-slate-800">{displaySarasValue(saras.address_line)}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-slate-500">Website</dt>
          <dd className="font-medium text-slate-800">
            {websiteHref ? (
              <a href={websiteHref} target="_blank" rel="noopener noreferrer" className="text-primary-700 hover:underline">
                {displaySarasValue(saras.website)}
              </a>
            ) : (
              displaySarasValue(saras.website)
            )}
          </dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-slate-500">Remarks</dt>
          <dd className="font-medium text-slate-800">{displaySarasValue(saras.remarks)}</dd>
        </div>
      </dl>
    </div>
  )
}
