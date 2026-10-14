import React from 'react'
import type { LucideIcon } from 'lucide-react'
import { Card, EmptyState } from '@/components/ui'

/** The server's message when it sent one, otherwise the fallback. */
export const errorMessage = (error: unknown, fallback: string) => {
  const e = error as { response?: { data?: { message?: string } }; message?: string }
  return String(e?.response?.data?.message || e?.message || fallback)
}

/** Loading state for a whole card body. */
export const CardLoading: React.FC<{ label: string }> = ({ label }) => (
  <div className="cb-table-state" role="status">
    <span className="cb-spinner" aria-hidden="true" />
    {label}
  </div>
)

/** A page that is planned but has nothing to manage yet. */
export const ComingSoon: React.FC<{ icon: LucideIcon; title: string; body: string }> = ({ icon, title, body }) => (
  <Card>
    <EmptyState icon={icon} title={title} body={body} />
  </Card>
)
