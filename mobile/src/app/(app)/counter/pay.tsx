import { useLocalSearchParams, usePreventRemove, useRouter } from 'expo-router'
import { IndianRupee, Share2 } from 'lucide-react-native'
import { useState } from 'react'
import { View } from 'react-native'

import { ApiError } from '@/lib/api'
import { classLabel, formatDayKey, formatINR, schoolToday } from '@/lib/format'
import { CardSkeleton, LoadFailed } from '@/portal/states'
import { MODE_LABELS, type FeePayment, type PaymentMode } from '@/services/feeService'
import { useFeeAccount, useRecordPayment } from '@/staff/feeQueries'
import { shareReceipt } from '@/staff/ReceiptActions'
import { space } from '@/theme/tokens'
import {
  ActionBar,
  ActionSheet,
  BottomSheet,
  Callout,
  ListGroup,
  MobileButton,
  MobileScreen,
  MobileTextField,
  MonthPicker,
  NavBar,
  OptionList,
  StatusView,
  haptic,
  useToast,
} from '@/ui'

// The counter takes these; "Online" is how the app's own fee payments are recorded.
const MODES: PaymentMode[] = ['cash', 'upi', 'cheque', 'dd', 'bank_transfer', 'card']
const money = (text: string) => Number(text.replace(/[^0-9.]/g, ''))

/**
 * Take a payment at the counter: the amount (the dues by default), how it was paid, and the
 * reference for UPI, card or cheque. It goes to the oldest dues first and makes the receipt,
 * which can be shared straight away. Money moved only when the success screen shows.
 */
export default function RecordPaymentScreen() {
  const router = useRouter()
  const toast = useToast()
  const { id } = useLocalSearchParams<{ id: string }>()
  const account = useFeeAccount(id)
  const record = useRecordPayment()
  const today = schoolToday()
  const data = account.data
  const due = (data?.demands ?? []).filter((demand) => demand.balance > 0 && demand.status !== 'waived').reduce((sum, demand) => sum + demand.balance, 0)
  const lateDue = (data?.demands ?? []).reduce((sum, demand) => sum + (demand.lateFeeDue || 0), 0)

  const [amount, setAmount] = useState<string | null>(null)
  const [lateFee, setLateFee] = useState<string | null>(null)
  const [mode, setMode] = useState<PaymentMode>('cash')
  const [date, setDate] = useState(today)
  const [reference, setReference] = useState('')
  const [chequeNo, setChequeNo] = useState('')
  const [bank, setBank] = useState('')
  const [remarks, setRemarks] = useState('')
  const [sheet, setSheet] = useState<'mode' | 'date' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<FeePayment | null>(null)
  const [leaving, setLeaving] = useState<null | (() => void)>(null)
  const [sharing, setSharing] = useState(false)

  const amountText = amount ?? (due ? String(due) : '')
  const lateText = lateFee ?? (lateDue ? String(lateDue) : '')
  const total = (money(amountText) || 0) + (money(lateText) || 0)
  const cheque = mode === 'cheque' || mode === 'dd'
  const dirty = !done && (amount !== null || reference !== '' || chequeNo !== '')
  const allowLeaving = usePreventRemove(dirty && !record.isPending, ({ repeat }) => setLeaving(() => repeat))

  const submit = async () => {
    const value = money(amountText)
    if (!value || value <= 0) return fail('Enter the amount to collect.')
    if (value > due + 0.001) return fail(`That is more than the ${formatINR(due)} due.`)
    if (cheque && !chequeNo.trim()) return fail(`Enter the ${mode === 'dd' ? 'draft' : 'cheque'} number.`)
    if ((mode === 'upi' || mode === 'bank_transfer' || mode === 'card') && !reference.trim()) return fail('Enter the transaction reference from the payment.')
    setError(null)
    try {
      const payment = await record.mutateAsync({
        studentId: id,
        input: {
          amount: value,
          lateFee: money(lateText) || 0,
          mode,
          date,
          reference: reference.trim(),
          ...(cheque ? { cheque: { number: chequeNo.trim(), bank: bank.trim() } } : {}),
          remarks: remarks.trim(),
        },
      })
      haptic.success()
      allowLeaving()
      setDone(payment)
    } catch (failure) {
      haptic.error()
      setError(
        failure instanceof ApiError
          ? `${failure.message} No money was recorded.`
          : "The payment wasn't recorded. Check your connection, then look at the receipts before trying again.",
      )
    }
  }

  function fail(message: string) {
    haptic.error()
    setError(message)
  }

  const share = async () => {
    if (!done || sharing) return
    setSharing(true)
    try {
      await shareReceipt(done)
    } catch {
      toast("Couldn't download the receipt. Try again.", 'danger')
    } finally {
      setSharing(false)
    }
  }

  if (done) {
    return (
      <MobileScreen nav={<NavBar title="Payment recorded" back={{ label: 'Fees', onPress: router.back }} />}>
        <StatusView
          kind="success"
          title={`${formatINR(done.total)} received`}
          body={`Receipt ${done.receiptNo} for ${data?.student.name ?? 'the student'} · ${MODE_LABELS[done.mode]}`}
          actions={
            <View style={{ gap: space['space-2'], alignSelf: 'stretch' }}>
              <MobileButton fullWidth icon={Share2} loading={sharing} onPress={share}>
                Share receipt
              </MobileButton>
              <MobileButton variant="gray" fullWidth onPress={() => router.back()}>
                Done
              </MobileButton>
            </View>
          }
        />
      </MobileScreen>
    )
  }

  return (
    <MobileScreen
      nav={<NavBar title="Record a payment" back={{ label: 'Fees', onPress: router.back }} />}
      actionBar={
        data?.account && due > 0 ? (
          <ActionBar
            icon={IndianRupee}
            summary={formatINR(total)}
            detail={`${MODE_LABELS[mode]} · ${date === today ? 'today' : formatDayKey(date, { weekday: 'short' })}`}
            label={record.isPending ? 'Recording…' : 'Record payment'}
            onPress={submit}
          />
        ) : undefined
      }
      overlay={
        <>
          <BottomSheet open={sheet !== null} onClose={() => setSheet(null)} title={sheet === 'mode' ? 'Paid by' : 'Date'}>
            {sheet === 'mode' ? (
              <OptionList
                label="Paid by"
                value={mode}
                onChange={(value) => {
                  setMode(value)
                  setSheet(null)
                }}
                options={MODES.map((value) => ({ value, label: MODE_LABELS[value] }))}
              />
            ) : sheet === 'date' ? (
              <MonthPicker
                value={date}
                today={today}
                onChange={(value) => {
                  setDate(value > today ? today : value)
                  setSheet(null)
                }}
              />
            ) : null}
          </BottomSheet>
          <ActionSheet
            open={Boolean(leaving)}
            onClose={() => setLeaving(null)}
            title="Leave without recording?"
            message="No money has been recorded."
            actions={[{ label: 'Leave', tone: 'danger', onSelect: () => leaving?.() }]}
            cancelLabel="Keep entering"
          />
        </>
      }
    >
      {account.isPending ? (
        <CardSkeleton rows={4} />
      ) : account.isError || !data ? (
        <LoadFailed what="The fee account" error={account.error} onRetry={account.refetch} />
      ) : !data.account || due <= 0 ? (
        <StatusView compact kind="empty" icon={IndianRupee} title="Nothing is due" body="This student has no dues to collect." />
      ) : (
        <>
          {error ? (
            <Callout tone="danger" title="Not recorded">
              {error}
            </Callout>
          ) : null}
          <ListGroup
            items={[
              { title: data.student.name, subtitle: `${classLabel(data.student.class, data.student.section)} · ${data.student.rollNumber}`, value: `${formatINR(due)} due`, lines: 2 },
            ]}
          />
          <View style={{ gap: space['space-4'] }}>
            <MobileTextField label="Amount (₹)" type="number" value={amountText} onChangeText={setAmount} hint="Goes to the oldest dues first." maxLength={9} />
            {lateDue ? <MobileTextField label="Late fee (₹)" type="number" value={lateText} onChangeText={setLateFee} hint={`${formatINR(lateDue)} late fee is due.`} maxLength={7} /> : null}
          </View>
          <ListGroup
            items={[
              { title: 'Paid by', value: MODE_LABELS[mode], onPress: () => setSheet('mode') },
              { title: 'Date', value: date === today ? 'Today' : formatDayKey(date, { weekday: 'short' }), onPress: () => setSheet('date') },
            ]}
          />
          <View style={{ gap: space['space-4'] }}>
            {cheque ? (
              <>
                <MobileTextField label={mode === 'dd' ? 'Draft number' : 'Cheque number'} type="number" value={chequeNo} onChangeText={setChequeNo} maxLength={12} />
                <MobileTextField label="Bank (optional)" value={bank} onChangeText={setBank} maxLength={80} />
              </>
            ) : mode !== 'cash' ? (
              <MobileTextField label="Transaction reference" value={reference} onChangeText={setReference} hint="The UTR or reference shown on the payment." maxLength={60} autoCapitalize="characters" />
            ) : null}
            <MobileTextField label="Remarks (optional)" value={remarks} onChangeText={setRemarks} maxLength={200} />
          </View>
        </>
      )}
    </MobileScreen>
  )
}
