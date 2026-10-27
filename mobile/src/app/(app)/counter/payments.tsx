import { useRouter } from 'expo-router'
import { Receipt } from 'lucide-react-native'
import { useState } from 'react'

import { formatDayKey, formatINR, schoolToday } from '@/lib/format'
import { CardSkeleton, LoadFailed } from '@/portal/states'
import { MODE_LABELS, type FeePayment, type PaymentMode } from '@/services/feeService'
import { usePayments } from '@/staff/feeQueries'
import { ReceiptActions, paymentDetail } from '@/staff/ReceiptActions'
import { BottomSheet, ChipRail, Hero, ListGroup, MobileScreen, MonthPicker, NavBar, StatusView, Surface } from '@/ui'

/** Receipts for one day, by how they were paid: the day's takings to tally, share or cancel. */
export default function PaymentsScreen() {
  const router = useRouter()
  const today = schoolToday()
  const [date, setDate] = useState(today)
  const [picking, setPicking] = useState(false)
  const [mode, setMode] = useState<'all' | PaymentMode>('all')
  const [open, setOpen] = useState<FeePayment | null>(null)
  const payments = usePayments(date, date)
  const rows = payments.data?.data ?? []
  const modes = [...new Set(rows.map((row) => row.mode))]
  const shown = rows.filter((row) => mode === 'all' || row.mode === mode)
  const total = (list: FeePayment[]) => list.filter((row) => row.status === 'valid').reduce((sum, row) => sum + row.total, 0)

  return (
    <MobileScreen
      refreshing={payments.isRefetching}
      onRefresh={payments.refetch}
      nav={<NavBar title="Payments" back={{ label: 'Counter', onPress: router.back }} />}
      overlay={
        <>
          <ReceiptActions payment={open} onClose={() => setOpen(null)} />
          <BottomSheet open={picking} onClose={() => setPicking(false)} title="Day">
            <MonthPicker
              value={date}
              today={today}
              onChange={(value) => {
                setDate(value > today ? today : value)
                setMode('all')
                setPicking(false)
              }}
            />
          </BottomSheet>
        </>
      }
    >
      <Hero
        tone="surface"
        icon={Receipt}
        label={date === today ? 'Today' : formatDayKey(date, { weekday: 'long' })}
        value={formatINR(total(rows))}
        detail={`${payments.data?.summary.count ?? 0} receipts`}
        action={{ label: 'Change day', onPress: () => setPicking(true) }}
      />
      {modes.length > 1 ? (
        <ChipRail
          label="Paid by"
          value={mode}
          onChange={setMode}
          items={[{ id: 'all' as const, label: 'All' }, ...modes.map((value) => ({ id: value, label: `${MODE_LABELS[value]} ${formatINR(total(rows.filter((row) => row.mode === value)), { compact: true })}` }))]}
        />
      ) : null}
      {payments.isPending ? (
        <CardSkeleton rows={4} />
      ) : payments.isError ? (
        <LoadFailed what="Payments" error={payments.error} onRetry={payments.refetch} />
      ) : shown.length ? (
        <ListGroup
          items={shown.map((payment) => ({
            title: payment.studentSnapshot?.name ?? payment.receiptNo,
            subtitle: [payment.receiptNo, paymentDetail(payment)].join(' · '),
            value: formatINR(payment.total),
            lines: 2,
            onPress: () => setOpen(payment),
          }))}
        />
      ) : (
        <Surface padded={false}>
          <StatusView compact kind="empty" icon={Receipt} title="No receipts this day" body="Pick another day." />
        </Surface>
      )}
    </MobileScreen>
  )
}
