import React, { useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import DOMPurify from 'dompurify'
import { Bell } from 'lucide-react'
import { Button, Card, DataTable, EmptyState, Page, PageHeader, formatDate, type DataTableColumn } from '@/components/ui'
import { usePortalNotice, usePortalNotices } from '../usePortal'
import type { PortalNotice } from '../portalService'
import { LoadFailed } from './shared'

const columns: DataTableColumn<PortalNotice>[] = [
  { key: 'title', header: 'Notice', mobile: 'title', wrap: true, render: (row) => row.title },
  { key: 'date', header: 'Date', mobile: 'aside', render: (row) => formatDate(row.circularDate) },
]

/** School-wide notices the school has published. */
export const PortalNotices: React.FC = () => {
  const navigate = useNavigate()
  const { data = [], isLoading, isError } = usePortalNotices()
  return (
    <Page>
      <PageHeader title="Notices" subtitle="Circulars from the school" />
      {isError ? <LoadFailed what="Notices" /> : null}
      <Card flush>
        <DataTable
          columns={columns}
          rows={data}
          getRowKey={(row) => row._id}
          onRowClick={(row) => navigate(`/portal/notices/${row._id}`)}
          loading={isLoading}
          loadingLabel="Loading notices"
          empty={<EmptyState icon={Bell} title="No notices yet" body="New circulars from the school show here." compact />}
        />
      </Card>
    </Page>
  )
}

export const PortalNoticeDetail: React.FC = () => {
  const { id } = useParams()
  const navigate = useNavigate()
  const { data, isLoading, isError } = usePortalNotice(id)
  // The circular body is HTML written by the school; strip anything executable.
  const html = useMemo(() => DOMPurify.sanitize(data?.content || '', { USE_PROFILES: { html: true } }), [data?.content])

  return (
    <Page>
      <PageHeader
        title={data?.title || 'Notice'}
        subtitle={data ? formatDate(data.circularDate) : undefined}
        back={{ label: 'Notices', onClick: () => navigate('/portal/notices') }}
      />
      {isError ? (
        <Card>
          <EmptyState
            icon={Bell}
            title="Notice not found"
            action={<Button variant="secondary" onClick={() => navigate('/portal/notices')}>Back to notices</Button>}
          />
        </Card>
      ) : (
        <Card>
          {isLoading ? <p className="cb-muted">Loading notice</p> : null}
          {data ? <div className="pt-notice" dangerouslySetInnerHTML={{ __html: html }} /> : null}
          {!isLoading && !data ? <LoadFailed what="The notice" /> : null}
        </Card>
      )}
    </Page>
  )
}
