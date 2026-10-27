import { useRouter } from 'expo-router'
import { CalendarRange, IndianRupee, Receipt, TriangleAlert } from 'lucide-react-native'
import { useState } from 'react'

import { classLabel, formatINR, schoolToday } from '@/lib/format'
import { CardSkeleton, LoadFailed } from '@/portal/states'
import type { FeePayment } from '@/services/feeService'
import { useFeeStudents, usePayments } from '@/staff/feeQueries'
import { ReceiptActions, paymentDetail } from '@/staff/ReceiptActions'
import { Hero, ListGroup, MobileScreen, NavBar, SearchBar, StatusView, Surface } from '@/ui'

/**
 * The fee counter: what came in today, find a student (name, admission number, father or the
 * guardian's phone) to see their dues and take a payment, and today's receipts.
 */
export default function FeeCounterScreen() {
  const router = useRouter()
  const today = schoolToday()
  const [query, setQuery] = useState('')
  const q = query.trim()
  const students = useFeeStudents(q, '', q.length >= 2)
  const payments = usePayments(today, today)
  const [open, setOpen] = useState<FeePayment | null>(null)
  const todays = payments.data?.data ?? []
  const summary = payments.data?.summary

  return (
    <MobileScreen
      refreshing={payments.isRefetching}
      onRefresh={payments.refetch}
      nav={
        <NavBar
          title="Fee counter"
          back={{ label: 'Back', onPress: router.back }}
          actions={[
            { icon: CalendarRange, label: 'Payments by day', onPress: () => router.push('/counter/payments') },
            { icon: TriangleAlert, label: 'Dues by class', onPress: () => router.push('/counter/dues') },
          ]}
        />
      }
      overlay={<ReceiptActions payment={open} onClose={() => setOpen(null)} />}
    >
      <Hero
        tone="surface"
        icon={IndianRupee}
        label="Collected today"
        value={formatINR(summary?.total ?? 0)}
        detail={summary ? `${summary.count} ${summary.count === 1 ? 'receipt' : 'receipts'}` : ' '}
      />
      <SearchBar label="Find a student" placeholder="Name or admission no." value={query} onChange={setQuery} onCancel={() => setQuery('')} />
      {q.length >= 2 ? (
        students.isPending ? (
          <CardSkeleton rows={3} />
        ) : students.isError ? (
          <LoadFailed what="Students" error={students.error} onRetry={students.refetch} />
        ) : students.data?.length ? (
          <ListGroup
            items={students.data.map((row) => ({
              title: row.name,
              subtitle: [classLabel(row.class, row.section), row.rollNumber, row.fatherName].filter(Boolean).join(' · '),
              value: row.accountId ? (row.dueNow ? formatINR(row.dueNow) : 'Paid up') : 'No fees set',
              lines: 2,
              onPress: () => router.push({ pathname: '/counter/[id]', params: { id: row._id } }),
            }))}
          />
        ) : (
          <Surface padded={false}>
            <StatusView compact kind="empty" title={`No student matches "${q}"`} body="Search by name, admission number, father's name or the guardian's phone." />
          </Surface>
        )
      ) : payments.isPending ? (
        <CardSkeleton rows={3} />
      ) : payments.isError ? (
        <LoadFailed what="Today's receipts" error={payments.error} onRetry={payments.refetch} />
      ) : todays.length ? (
        <ListGroup
          header="Today's receipts"
          items={todays.map((payment) => ({
            title: payment.studentSnapshot?.name ?? payment.receiptNo,
            subtitle: [payment.receiptNo, paymentDetail(payment)].join(' · '),
            value: formatINR(payment.total),
            icon: Receipt,
            tile: 3,
            lines: 2,
            onPress: () => setOpen(payment),
          }))}
        />
      ) : (
        <Surface padded={false}>
          <StatusView compact kind="empty" icon={Receipt} title="No receipts yet today" body="Find a student above to take a payment." />
        </Surface>
      )}
    </MobileScreen>
  )
}
