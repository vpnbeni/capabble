import { IndianRupee, UserRound } from 'lucide-react-native'
import { useState } from 'react'
import { StyleSheet, View } from 'react-native'

import { formatDate, formatINR } from '@/lib/format'
import { sharePdf } from '@/lib/sharePdf'
import { ChildSwitcher } from '@/portal/ChildSwitcher'
import { usePortal } from '@/portal/PortalProvider'
import { usePortalFees } from '@/portal/queries'
import { portalService, type PortalFees } from '@/services/portalService'
import { useTheme } from '@/theme/ThemeProvider'
import { fontFamily, space, type Tone } from '@/theme/tokens'
import { Badge, Button, Card, EmptyState, Figure, ListRow, Progress, Screen, Sheet, Skeleton, Text, useToast } from '@/ui'

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

  const downloadReceipt = async (payment: Payment) => {
    if (!child) return
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

  return (
    <Screen
      title="Fees"
      headerAction={<ChildSwitcher />}
      refreshing={fees.isRefetching}
      onRefresh={child ? fees.refetch : undefined}
    >
      {!child ? (
        <Card>
          <EmptyState icon={UserRound} title="No student is linked to this login" body="Ask the school office to link your child to your login." />
        </Card>
      ) : fees.isPending ? (
        <FeesSkeleton />
      ) : fees.isError ? (
        <Card>
          <EmptyState
            title="Fees didn't load"
            body={fees.error.message}
            action={<Button label="Try again" variant="secondary" onPress={() => fees.refetch()} />}
          />
        </Card>
      ) : !fees.data ? (
        <Card>
          <EmptyState icon={IndianRupee} title="No fee account yet" body="Fees show here once the school sets up this session's fees." />
        </Card>
      ) : (
        <>
          <Card title={child.name}>
            <View style={{ gap: space['space-3'] }}>
              <Figure
                label={fees.data.totals.balance > 0 ? 'Still due' : 'All fees paid'}
                value={formatINR(fees.data.totals.balance)}
                caption={`${formatINR(fees.data.totals.paid)} paid of ${formatINR(fees.data.totals.demanded)} this session`}
              />
              <Progress value={fees.data.totals.paid} max={fees.data.totals.demanded} label="Fees paid this session" tone="success" />
            </View>
          </Card>

          <Card title="Fee schedule" flush>
            {fees.data.demands.length === 0 ? (
              <EmptyState title="No fees scheduled" />
            ) : (
              fees.data.demands.map((demand, index, demands) => {
                const status = feeStatus(demand)
                const owing = demand.balance > 0 && demand.status !== 'paid' && demand.status !== 'waived'
                return (
                  <ListRow
                    key={demand._id}
                    primary={demand.label}
                    secondary={`Due ${formatDate(demand.dueDate)} · ${owing ? `${formatINR(demand.balance)} still due` : formatINR(demand.total)}`}
                    trailing={<Badge label={status.label} tone={status.tone} />}
                    divider={index < demands.length - 1}
                    onPress={() => setOpen(demand)}
                  />
                )
              })
            )}
          </Card>

          <Card title="Payments" flush>
            {fees.data.payments.length === 0 ? (
              <EmptyState title="No payments yet" />
            ) : (
              fees.data.payments.map((payment, index, payments) => (
                <ListRow
                  key={payment._id}
                  primary={formatINR(payment.amount)}
                  secondary={`${formatDate(payment.date)} · ${MODE_LABEL[payment.mode] || payment.mode} · ${payment.receiptNo}`}
                  trailing={
                    <Button label="Receipt" variant="tertiary" loading={downloading === payment._id} onPress={() => downloadReceipt(payment)} />
                  }
                  divider={index < payments.length - 1}
                />
              ))
            )}
          </Card>
        </>
      )}

      <Sheet
        open={Boolean(open)}
        onClose={() => setOpen(null)}
        title={open?.label ?? ''}
        description={open ? `Due ${formatDate(open.dueDate)}` : undefined}
        footer={<Button label="Done" onPress={() => setOpen(null)} />}
      >
        {open ? <DemandBreakdown demand={open} /> : null}
      </Sheet>
    </Screen>
  )
}

function DemandBreakdown({ demand }: { demand: Demand }) {
  const { colors } = useTheme()
  const status = feeStatus(demand)
  return (
    <View style={{ gap: space['space-4'] }}>
      <Badge label={status.label} tone={status.tone} />
      <View>
        {demand.lines.map((line) => (
          <View key={line.name} style={[styles.line, { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}>
            <Text variant="body-lg" style={{ flex: 1 }}>
              {line.name}
            </Text>
            <Text variant="body-lg" numeric>
              {formatINR(line.amount)}
            </Text>
          </View>
        ))}
        <TotalLine label="Total" value={demand.total} strong />
        <TotalLine label="Paid" value={demand.paid} />
        <TotalLine label="Still due" value={demand.balance} strong />
      </View>
    </View>
  )
}

function TotalLine({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <View style={styles.line}>
      <Text variant="body-lg" tone={strong ? 'ink' : 'muted'} style={[{ flex: 1 }, strong && { fontFamily: fontFamily[600] }]}>
        {label}
      </Text>
      <Text variant="body-lg" tone={strong ? 'ink' : 'muted'} numeric style={strong && { fontFamily: fontFamily[600] }}>
        {formatINR(value)}
      </Text>
    </View>
  )
}

function FeesSkeleton() {
  return (
    <>
      <Card>
        <View style={{ flexDirection: 'row', gap: space['space-2'] }}>
          {[0, 1, 2].map((tile) => (
            <View key={tile} style={{ flex: 1 }}>
              <Skeleton height={64} />
            </View>
          ))}
        </View>
      </Card>
      <Card>
        <View style={{ gap: space['space-4'] }}>
          {[0, 1, 2].map((row) => (
            <View key={row} style={{ gap: space['space-2'] }}>
              <Skeleton width="50%" />
              <Skeleton width="70%" height={12} />
            </View>
          ))}
        </View>
      </Card>
    </>
  )
}

const styles = StyleSheet.create({
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space['space-3'],
    paddingVertical: space['space-2'],
  },
})
