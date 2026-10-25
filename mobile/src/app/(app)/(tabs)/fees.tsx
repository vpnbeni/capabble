import { Receipt } from 'lucide-react-native'
import { useState } from 'react'

import { formatDate, formatINR } from '@/lib/format'
import { sharePdf } from '@/lib/sharePdf'
import { ChildSwitcher } from '@/portal/ChildSwitcher'
import { usePortal } from '@/portal/PortalProvider'
import { usePortalFees } from '@/portal/queries'
import { CardSkeleton, LoadFailed, NoChild } from '@/portal/states'
import { portalService, type PortalFees } from '@/services/portalService'
import { radius, type Tone } from '@/theme/tokens'
import { Badge, BottomSheet, DetailList, Hero, ListGroup, MobileButton, MobileScreen, NavBar, Skeleton, StatusView, Surface, useToast } from '@/ui'

type Demand = PortalFees['demands'][number]
type Payment = PortalFees['payments'][number]

const STATUS: Record<string, { tone: Tone; label: string }> = {
  paid: { tone: 'success', label: 'Paid' },
  partial: { tone: 'warning', label: 'Partly paid' },
  due: { tone: 'info', label: 'Due' },
  overdue: { tone: 'danger', label: 'Overdue' },
  waived: { tone: 'neutral', label: 'Waived' },
}

const feeStatus = (demand: Demand) => STATUS[demand.isOverdue && demand.status !== 'paid' ? 'overdue' : demand.status] ?? STATUS.due
const isOwing = (demand: Demand) => demand.balance > 0 && demand.status !== 'paid' && demand.status !== 'waived'

const MODE_LABEL: Record<string, string> = {
  cash: 'Cash', upi: 'UPI', cheque: 'Cheque', dd: 'Demand draft', bank_transfer: 'Bank transfer', card: 'Card',
}

/** Parents only: what is due, what has been paid, and receipts to share or save. */
export default function FeesScreen() {
  const { child } = usePortal()
  const fees = usePortalFees(child?.studentId)
  const toast = useToast()
  const [open, setOpen] = useState<Demand | null>(null)
  const [downloading, setDownloading] = useState<string | null>(null)

  const shareReceipt = async (payment: Payment) => {
    if (!child || downloading) return
    setDownloading(payment._id)
    try {
      const bytes = await portalService.receiptPdf(child.studentId, payment._id)
      await sharePdf(bytes, `receipt-${payment.receiptNo.replace(/[^\w-]+/g, '-')}.pdf`)
    } catch {
      toast("Couldn't download the receipt. Try again.", 'danger')
    } finally {
      setDownloading(null)
    }
  }

  const data = fees.data
  const owing = data?.demands.filter(isOwing) ?? []
  const overdue = owing.some((demand) => demand.isOverdue)
  const next = [...owing].sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0]
  const paidShare = data && data.totals.demanded > 0 ? Math.round((data.totals.paid / data.totals.demanded) * 100) : 0

  return (
    <MobileScreen
      tabs
      refreshing={fees.isRefetching}
      onRefresh={child ? fees.refetch : undefined}
      nav={<NavBar large title="Fees" accessory={<ChildSwitcher />} />}
      overlay={
        <BottomSheet
          open={Boolean(open)}
          onClose={() => setOpen(null)}
          title={open?.label ?? ''}
          description={open ? `Due ${formatDate(open.dueDate)}` : undefined}
          footer={
            <MobileButton variant="gray" fullWidth onPress={() => setOpen(null)}>
              Done
            </MobileButton>
          }
        >
          {open ? <DemandBreakdown demand={open} /> : null}
        </BottomSheet>
      }
    >
      {!child ? (
        <NoChild />
      ) : fees.isPending ? (
        <>
          <Skeleton height={150} radius={radius['radius-xl']} />
          <CardSkeleton rows={3} />
        </>
      ) : fees.isError ? (
        <LoadFailed what="Fees" error={fees.error} onRetry={fees.refetch} />
      ) : !data ? (
        <Surface padded={false}>
          <StatusView compact kind="empty" title="No fee account yet" body="Fees show here once the school sets up this session's fees." />
        </Surface>
      ) : (
        <>
          <Hero
            tone={overdue ? 'strong' : data.totals.balance > 0 ? 'soft' : 'surface'}
            label={data.totals.balance <= 0 ? 'All fees paid' : overdue ? 'Overdue' : next ? `Due ${formatDate(next.dueDate)}` : 'Still due'}
            value={formatINR(data.totals.balance > 0 ? data.totals.balance : data.totals.paid)}
            detail={
              data.totals.balance > 0
                ? `${formatINR(data.totals.paid)} paid of ${formatINR(data.totals.demanded)} this session`
                : `Paid this session for ${child.name.split(' ')[0]}`
            }
            meta={data.totals.demanded > 0 ? `${paidShare}% paid` : undefined}
            progress={data.totals.demanded > 0 ? paidShare : undefined}
          />

          {data.demands.length ? (
            <ListGroup
              header="Fee schedule"
              items={data.demands.map((demand) => {
                const status = feeStatus(demand)
                return {
                  title: demand.label,
                  subtitle: `Due ${formatDate(demand.dueDate)}`,
                  value: formatINR(isOwing(demand) ? demand.balance : demand.total),
                  badge: status.tone === 'info' ? undefined : status,
                  onPress: () => setOpen(demand),
                }
              })}
            />
          ) : null}

          {data.payments.length ? (
            <ListGroup
              header="Receipts"
              footer="Tap a receipt to share or save it."
              items={data.payments.map((payment) => ({
                title: payment.receiptNo,
                subtitle: downloading === payment._id ? 'Preparing the receipt…' : `${formatDate(payment.date)} · ${MODE_LABEL[payment.mode] || payment.mode}`,
                value: formatINR(payment.amount),
                icon: Receipt,
                tile: 3,
                onPress: () => shareReceipt(payment),
              }))}
            />
          ) : (
            <Surface padded={false}>
              <StatusView compact kind="empty" title="No payments yet" body="Receipts show here after the school records a payment." />
            </Surface>
          )}
        </>
      )}
    </MobileScreen>
  )
}

function DemandBreakdown({ demand }: { demand: Demand }) {
  const status = feeStatus(demand)
  return (
    <>
      <Badge label={status.label} tone={status.tone} />
      <ListGroup items={demand.lines.map((line) => ({ title: line.name, value: formatINR(line.amount) }))} />
      <DetailList
        columns={2}
        items={[
          { label: 'Total', value: formatINR(demand.total), numeric: true },
          { label: 'Paid', value: formatINR(demand.paid), numeric: true },
          { label: 'Still due', value: formatINR(demand.balance), numeric: true },
        ]}
      />
    </>
  )
}
