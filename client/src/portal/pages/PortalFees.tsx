import React, { useState } from 'react'
import toast from 'react-hot-toast'
import { Download, IndianRupee } from 'lucide-react'
import {
  Button,
  Card,
  DataTable,
  EmptyState,
  MetricTile,
  MetricTiles,
  Page,
  PageHeader,
  formatDate,
  formatINR,
  type DataTableColumn,
} from '@/components/ui'
import { usePortal } from '../PortalContext'
import { usePortalFees } from '../usePortal'
import portalService, { type PortalFees as Fees } from '../portalService'
import { FeeStatusBadge, LoadFailed, NoChild } from './shared'

type Demand = Fees['demands'][number]
type Payment = Fees['payments'][number]

const MODE_LABEL: Record<string, string> = {
  cash: 'Cash', upi: 'UPI', cheque: 'Cheque', dd: 'Demand draft', bank_transfer: 'Bank transfer', card: 'Card',
}

/** Parents only: what is due, what has been paid, and receipts to download. */
const PortalFees: React.FC = () => {
  const { child } = usePortal()
  const { data, isLoading, isError } = usePortalFees(child?.studentId)
  const [downloading, setDownloading] = useState<string | null>(null)

  if (!child) return <Page><NoChild /></Page>

  const downloadReceipt = async (payment: Payment) => {
    setDownloading(payment._id)
    try {
      const blob = await portalService.receiptPdf(child.studentId, payment._id)
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `receipt-${payment.receiptNo.replace(/\//g, '-')}.pdf`
      link.click()
      URL.revokeObjectURL(url)
    } catch {
      toast.error('Could not download the receipt. Try again.')
    } finally {
      setDownloading(null)
    }
  }

  const demandColumns: DataTableColumn<Demand>[] = [
    { key: 'label', header: 'For', mobile: 'title', render: (row) => row.label },
    { key: 'due', header: 'Due date', mobile: 'subtitle', render: (row) => formatDate(row.dueDate) },
    { key: 'total', header: 'Amount', numeric: true, mobile: 'hidden', render: (row) => formatINR(row.total) },
    { key: 'balance', header: 'Still due', numeric: true, mobile: 'hidden', render: (row) => formatINR(row.balance) },
    { key: 'status', header: 'Status', mobile: 'aside', render: (row) => <FeeStatusBadge status={row.status} isOverdue={row.isOverdue} /> },
  ]

  const paymentColumns: DataTableColumn<Payment>[] = [
    { key: 'receipt', header: 'Receipt', mobile: 'title', render: (row) => row.receiptNo },
    { key: 'date', header: 'Paid on', mobile: 'subtitle', render: (row) => `${formatDate(row.date)} · ${MODE_LABEL[row.mode] || row.mode}` },
    { key: 'amount', header: 'Amount', numeric: true, mobile: 'aside', render: (row) => formatINR(row.amount) },
    {
      key: 'download',
      header: '',
      headerLabel: 'Download',
      interactive: true,
      render: (row) => (
        <Button size="sm" variant="tertiary" icon={Download} loading={downloading === row._id} onClick={() => downloadReceipt(row)}>
          Receipt
        </Button>
      ),
    },
  ]

  return (
    <Page>
      <PageHeader title="Fees" subtitle={child.name} />
      {isError ? <LoadFailed what="Fees" /> : null}
      {!isLoading && !isError && !data ? (
        <Card>
          <EmptyState icon={IndianRupee} title="No fee account yet" body="Fees will show here once the school sets up this session's fees." />
        </Card>
      ) : null}
      {data ? (
        <>
          <Card>
            <MetricTiles>
              <MetricTile label="Fees this session" value={formatINR(data.totals.demanded)} />
              <MetricTile label="Paid" value={formatINR(data.totals.paid)} tone="success" />
              <MetricTile label="Still due" value={formatINR(data.totals.balance)} tone={data.totals.balance > 0 ? 'warning' : undefined} />
            </MetricTiles>
          </Card>
          <Card flush title="Fee schedule">
            <DataTable
              columns={demandColumns}
              rows={data.demands}
              getRowKey={(row) => row._id}
              empty={<EmptyState title="No fees scheduled" compact />}
            />
          </Card>
          <Card flush title="Payments">
            <DataTable
              columns={paymentColumns}
              rows={data.payments}
              getRowKey={(row) => row._id}
              empty={<EmptyState title="No payments yet" compact />}
            />
          </Card>
        </>
      ) : null}
    </Page>
  )
}

export default PortalFees
