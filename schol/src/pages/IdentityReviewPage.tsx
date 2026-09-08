import { useQuery } from '@tanstack/react-query'
import { fetchMatchCandidates } from '@/services/collection'

export function IdentityReviewPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['match-candidates'],
    queryFn: fetchMatchCandidates,
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Identity Review</h1>
        <p className="mt-1 text-slate-600">Resolve ambiguous SARAS-to-SCHOL identity matches.</p>
      </div>

      {isLoading && <div className="text-slate-500">Loading review queue...</div>}

      <div className="space-y-3">
        {data?.length ? data.map((item: {
          id: string
          matching_method: string
          confidence_score: number
          source_payload: { school_name?: string }
          candidate_school_id: string
        }) => (
          <div key={item.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="font-medium text-slate-900">{item.source_payload?.school_name || 'Unknown SARAS school'}</div>
            <div className="mt-2 text-sm text-slate-600">
              Method: {item.matching_method} · Confidence: {item.confidence_score}
            </div>
            <div className="mt-2 text-sm text-slate-600">Candidate school: {item.candidate_school_id}</div>
          </div>
        )) : (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-500">
            No pending identity reviews.
          </div>
        )}
      </div>
    </div>
  )
}
