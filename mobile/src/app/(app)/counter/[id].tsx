import { useLocalSearchParams, useRouter } from 'expo-router'
import { IndianRupee, Phone, Receipt } from 'lucide-react-native'
import { useState } from 'react'
import { Linking } from 'react-native'

import { classLabel, formatDate, formatINR } from '@/lib/format'
import { CardSkeleton, LoadFailed } from '@/portal/states'
import type { FeeDemand, FeePayment } from '@/services/feeService'
import { useFeeAccount } from '@/staff/feeQueries'
import { ReceiptActions, paymentDetail } from '@/staff/ReceiptActions'
import { useStaff } from '@/staff/useStaff'
import type { Tone } from '@/theme/tokens'
import { ActionBar, Callout, Hero, ListGroup, MobileScreen, NavBar, StatusView, Surface } from '@/ui'

const DEMAND_STATUS: Record<FeeDemand['status'], { label: string; tone: Tone }> = {
  due: { label: 'Due', tone: 'info' },
  partial: { label: 'Partial', tone: 'warning' },
  paid: { label: 'Paid', tone: 'success' },
  waived: { label: 'Waived', tone: 'neutral' },
}

/** One student's fees at the counter: what is due by installment, their receipts, and "Record a payment". */
export default function FeeAccountScreen() {
  const router = useRouter()
  const staff = useStaff()
  const { id } = useLocalSearchParams<{ id: string }>()
  const account = useFeeAccount(id)
  const [open, setOpen] = useState<FeePayment | null>(null)
  const data = account.data
  const open_ = (data?.demands ?? []).filter((demand) => demand.balance > 0 && demand.status !== 'waived')
  const balance = open_.reduce((sum, demand) => sum + demand.balance, 0)
  const overdue = open_.filter((demand) => demand.isOverdue)
  const lateFee = open_.reduce((sum, demand) => sum + (demand.lateFeeDue || 0), 0)
  const canCollect = staff.can('cpitl.finance.collect')

  return (
    <MobileScreen
      refreshing={account.isRefetching}
      onRefresh={account.refetch}
      nav={<NavBar title={data?.student.name ?? 'Fees'} back={{ label: 'Counter', onPress: router.back }} />}
      actionBar={
        data?.account && balance > 0 && canCollect ? (
          <ActionBar
            icon={IndianRupee}
            summary={formatINR(balance)}
            detail={overdue.length ? `${overdue.length} ${overdue.length === 1 ? 'installment' : 'installments'} overdue` : 'Still due'}
            label="Record a payment"
            onPress={() => router.push({ pathname: '/counter/pay', params: { id } })}
          />
        ) : undefined
      }
      overlay={<ReceiptActions payment={open} onClose={() => setOpen(null)} />}
    >
      {account.isPending ? (
        <CardSkeleton rows={4} />
      ) : account.isError || !data ? (
        <LoadFailed what="The fee account" error={account.error} onRetry={account.refetch} />
      ) : !data.account ? (
        <Surface padded={false}>
          <StatusView compact kind="empty" icon={IndianRupee} title="No fees set for this student" body="Assign the class's fee structure first; then dues show here." />
        </Surface>
      ) : (
        <>
          <Hero
            tone={overdue.length ? 'strong' : 'surface'}
            icon={IndianRupee}
            label={balance > 0 ? 'Still due this session' : 'All fees paid'}
            value={formatINR(balance > 0 ? balance : data.account.totals.paid)}
            detail={`${classLabel(data.student.class, data.student.section)} · ${data.student.rollNumber}${lateFee ? ` · late fee ${formatINR(lateFee)}` : ''}`}
          />
          {data.structure?.isOutdated ? (
            <Callout tone="warning" title="The fee structure changed">
              This student’s dues are from an older version. The accounts office updates them.
            </Callout>
          ) : null}
          {data.student.guardianPhone ? (
            <ListGroup
              items={[
                {
                  title: data.student.fatherName || 'Guardian',
                  subtitle: data.student.guardianPhone,
                  icon: Phone,
                  tile: 3,
                  onPress: () => Linking.openURL(`tel:${String(data.student.guardianPhone).replace(/\s+/g, '')}`),
                },
              ]}
            />
          ) : null}
          <ListGroup
            header="Installments"
            items={data.demands.map((demand) => ({
              title: demand.label || demand.periodKey,
              subtitle: `Due ${formatDate(demand.dueDate)}${demand.paid ? ` · paid ${formatINR(demand.paid)}` : ''}${demand.lateFeeDue ? ` · late fee ${formatINR(demand.lateFeeDue)}` : ''}`,
              value: demand.balance > 0 && demand.status !== 'waived' ? formatINR(demand.balance) : formatINR(demand.total),
              // A waived installment keeps its balance on the server; it is not owed.
              badge: demand.status !== 'waived' && demand.isOverdue && demand.balance > 0 ? { label: 'Overdue', tone: 'danger' as const } : DEMAND_STATUS[demand.status],
              lines: 2,
            }))}
          />
          {data.payments.length ? (
            <ListGroup
              header="Receipts"
              footer="Tap a receipt to share it."
              items={data.payments.map((payment) => ({
                title: payment.receiptNo,
                subtitle: paymentDetail(payment),
                value: formatINR(payment.total),
                icon: Receipt,
                tile: 3,
                lines: 2,
                onPress: () => setOpen({ ...payment, studentSnapshot: payment.studentSnapshot ?? { name: data.student.name } }),
              }))}
            />
          ) : null}
        </>
      )}
    </MobileScreen>
  )
}
