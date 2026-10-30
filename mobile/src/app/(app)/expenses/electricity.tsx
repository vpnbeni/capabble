import { useRouter } from 'expo-router'
import { Plug, Plus, Zap } from 'lucide-react-native'
import { useState } from 'react'
import { View } from 'react-native'

import { ApiError } from '@/lib/api'
import { formatDate, formatINR, formatMonth, monthAdd, monthOf, schoolToday } from '@/lib/format'
import { CardSkeleton, LoadFailed } from '@/portal/states'
import type { ElectricityBill } from '@/services/expenseService'
import { MODE_LABELS, type PaymentMode } from '@/services/feeService'
import { useAddBill, useAddMeter, useBills, useMeters, usePayBill } from '@/staff/expenseQueries'
import { useStaff } from '@/staff/useStaff'
import { space } from '@/theme/tokens'
import { ActionBar, ActionSheet, BottomSheet, Callout, ListGroup, MobileButton, MobileScreen, MobileTextField, NavBar, OptionList, StatusView, Surface, Switch, haptic, useToast } from '@/ui'

type BillForm = { connectionId: string; billMonth: string; prev: string; curr: string; amount: string; billNo: string; paid: boolean; mode: PaymentMode; picking: 'meter' | 'month' | 'mode' | null }

const MODES = (Object.keys(MODE_LABELS) as PaymentMode[]).map((value) => ({ value, label: MODE_LABELS[value] }))

/**
 * Electricity (the website's Finance → Electricity): each meter's bills by month with units from
 * the readings, add a month's bill (paid now or later), pay an unpaid one (that records the
 * expense), add a meter.
 */
export default function ElectricityScreen() {
  const router = useRouter()
  const toast = useToast()
  const staff = useStaff()
  const canLog = staff.can('cpitl.finance.expense_log')
  const meters = useMeters()
  const bills = useBills()
  const addBill = useAddBill()
  const addMeter = useAddMeter()
  const payBill = usePayBill()
  const [form, setForm] = useState<BillForm | null>(null)
  const [meter, setMeter] = useState<{ name: string; consumerNo: string; meterNo: string; provider: string } | null>(null)
  const [paying, setPaying] = useState<ElectricityBill | null>(null)
  const [error, setError] = useState<string | null>(null)

  const thisMonth = monthOf(schoolToday())
  const unpaid = (bills.data ?? []).filter((row) => row.status === 'unpaid')
  const meterName = (id: string) => meters.data?.find((row) => row._id === id)?.name

  const fail = (failure: unknown, fallback: string) => {
    haptic.error()
    setError(failure instanceof ApiError ? failure.message : fallback)
  }

  const openBill = () => {
    setError(null)
    // The last bill of the first meter gives the previous reading.
    const first = meters.data?.[0]?._id ?? ''
    const last = (bills.data ?? []).find((row) => row.connectionId === first)
    setForm({ connectionId: first, billMonth: thisMonth, prev: last?.currReading != null ? String(last.currReading) : '', curr: '', amount: '', billNo: '', paid: false, mode: 'bank_transfer', picking: null })
  }

  const saveBill = async () => {
    if (!form) return
    if (!form.connectionId) return setError('Choose the meter.')
    if (!(Number(form.amount) > 0)) return setError('Enter the bill amount.')
    if (form.prev && form.curr && Number(form.curr) < Number(form.prev)) return setError('This month’s reading is lower than last month’s.')
    try {
      await addBill.mutateAsync({
        connectionId: form.connectionId,
        billMonth: form.billMonth,
        amount: Number(form.amount),
        prevReading: form.prev ? Number(form.prev) : undefined,
        currReading: form.curr ? Number(form.curr) : undefined,
        billNo: form.billNo.trim() || undefined,
        markPaid: form.paid || undefined,
        mode: form.paid ? form.mode : undefined,
        paidOn: form.paid ? schoolToday() : undefined,
      })
      haptic.success()
      setForm(null)
      toast(form.paid ? 'Bill saved and paid' : 'Bill saved')
    } catch (failure) {
      fail(failure, "The bill wasn't saved. Try again.")
    }
  }

  const saveMeter = async () => {
    if (!meter) return
    if (!meter.name.trim()) return setError('Give the meter a name, like “Main building”.')
    try {
      await addMeter.mutateAsync({ name: meter.name.trim(), consumerNo: meter.consumerNo.trim() || undefined, meterNo: meter.meterNo.trim() || undefined, provider: meter.provider.trim() || undefined })
      haptic.success()
      setMeter(null)
      toast('Meter added')
    } catch (failure) {
      fail(failure, "The meter wasn't added. Try again.")
    }
  }

  const doPay = async (bill: ElectricityBill, mode: PaymentMode) => {
    setPaying(null)
    try {
      await payBill.mutateAsync({ id: bill._id, input: { mode, paidOn: schoolToday() } })
      haptic.success()
      toast(`${formatINR(bill.amount)} paid`)
    } catch (failure) {
      haptic.error()
      toast(failure instanceof ApiError ? failure.message : "It wasn't paid. Try again.", 'danger')
    }
  }

  const pickerBody = () => {
    if (!form) return null
    if (form.picking === 'meter')
      return <OptionList label="Meter" value={form.connectionId} onChange={(connectionId) => setForm({ ...form, connectionId, picking: null })} options={(meters.data ?? []).map((row) => ({ value: row._id, label: row.name, meta: row.consumerNo }))} />
    if (form.picking === 'month')
      return <OptionList label="Month" value={form.billMonth} onChange={(billMonth) => setForm({ ...form, billMonth, picking: null })} options={[0, -1, -2, -3].map((delta) => ({ value: monthAdd(thisMonth, delta), label: formatMonth(monthAdd(thisMonth, delta)) }))} />
    if (form.picking === 'mode') return <OptionList label="Paid by" value={form.mode} onChange={(mode) => setForm({ ...form, mode, picking: null })} options={MODES} />
    const units = form.prev && form.curr ? Number(form.curr) - Number(form.prev) : null
    return (
      <View style={{ gap: space['space-4'] }}>
        {error ? <Callout tone="danger" title="Not saved">{error}</Callout> : null}
        <ListGroup
          items={[
            { title: 'Meter', value: meterName(form.connectionId) ?? 'Choose', onPress: () => setForm({ ...form, picking: 'meter' }) },
            { title: 'Month', value: formatMonth(form.billMonth), onPress: () => setForm({ ...form, picking: 'month' }) },
          ]}
        />
        <MobileTextField label="Last reading (optional)" type="number" value={form.prev} onChangeText={(prev) => setForm({ ...form, prev: prev.replace(/[^0-9.]/g, '') })} maxLength={10} returnKeyType="next" />
        <MobileTextField label="This reading (optional)" hint={units !== null && units >= 0 ? `${units} units` : undefined} type="number" value={form.curr} onChangeText={(curr) => setForm({ ...form, curr: curr.replace(/[^0-9.]/g, '') })} maxLength={10} returnKeyType="next" />
        <MobileTextField label="Amount" type="number" prefix="₹" value={form.amount} onChangeText={(amount) => setForm({ ...form, amount: amount.replace(/[^0-9.]/g, '') })} maxLength={10} returnKeyType="next" />
        <MobileTextField label="Bill number (optional)" value={form.billNo} onChangeText={(billNo) => setForm({ ...form, billNo })} maxLength={40} />
        <ListGroup
          items={[
            { title: 'Paid already', accessory: <Switch label="Paid already" value={form.paid} onChange={(paid) => setForm({ ...form, paid })} /> },
            ...(form.paid ? [{ title: 'Paid by', value: MODE_LABELS[form.mode], onPress: () => setForm({ ...form, picking: 'mode' }) }] : []),
          ]}
        />
      </View>
    )
  }

  return (
    <MobileScreen
      refreshing={bills.isRefetching || meters.isRefetching}
      onRefresh={() => (bills.refetch(), meters.refetch())}
      nav={<NavBar title="Electricity" back={{ label: 'Expenses', onPress: router.back }} actions={canLog ? [{ icon: Plug, label: 'Add a meter', onPress: () => (setError(null), setMeter({ name: '', consumerNo: '', meterNo: '', provider: '' })) }] : []} />}
      actionBar={
        canLog && meters.isSuccess && !meters.data.length ? (
          <ActionBar icon={Plug} summary="No meters yet" detail="Add each meter the school pays for" label="Add a meter" onPress={() => (setError(null), setMeter({ name: '', consumerNo: '', meterNo: '', provider: '' }))} />
        ) : canLog && meters.data?.length ? <ActionBar icon={Zap} summary={unpaid.length ? `${unpaid.length} unpaid · ${formatINR(unpaid.reduce((sum, row) => sum + row.amount, 0))}` : 'All bills paid'} detail="Add this month’s bill" label="Add a bill" onPress={openBill} /> : undefined
      }
      overlay={
        <>
          <BottomSheet
            open={Boolean(form)}
            onClose={() => (form?.picking ? setForm({ ...form, picking: null }) : setForm(null))}
            title={form?.picking === 'meter' ? 'Meter' : form?.picking === 'month' ? 'Month' : form?.picking === 'mode' ? 'Paid by' : 'Add a bill'}
            detent="large"
            footer={form?.picking ? undefined : <MobileButton fullWidth loading={addBill.isPending} onPress={saveBill}>Save bill</MobileButton>}
          >
            {pickerBody()}
          </BottomSheet>
          <BottomSheet open={Boolean(meter)} onClose={() => setMeter(null)} title="Add a meter" footer={<MobileButton fullWidth loading={addMeter.isPending} onPress={saveMeter}>Add meter</MobileButton>}>
            {error ? <Callout tone="danger" title="Not added">{error}</Callout> : null}
            {meter ? (
              <View style={{ gap: space['space-4'] }}>
                <MobileTextField label="Name" placeholder="Main building" value={meter.name} onChangeText={(name) => setMeter({ ...meter, name })} maxLength={100} returnKeyType="next" />
                <MobileTextField label="Consumer number (optional)" value={meter.consumerNo} onChangeText={(consumerNo) => setMeter({ ...meter, consumerNo })} maxLength={40} returnKeyType="next" />
                <MobileTextField label="Meter number (optional)" value={meter.meterNo} onChangeText={(meterNo) => setMeter({ ...meter, meterNo })} maxLength={40} returnKeyType="next" />
                <MobileTextField label="Company (optional)" placeholder="DHBVN" value={meter.provider} onChangeText={(provider) => setMeter({ ...meter, provider })} maxLength={100} />
              </View>
            ) : null}
          </BottomSheet>
          <ActionSheet
            open={Boolean(paying)}
            onClose={() => setPaying(null)}
            title={paying ? `Pay ${formatINR(paying.amount)}` : ''}
            message={paying ? `${paying.connectionSnapshot?.name ?? meterName(paying.connectionId) ?? 'Meter'} · ${formatMonth(paying.billMonth)} · paid today, by` : undefined}
            actions={paying ? (['bank_transfer', 'upi', 'cheque', 'cash'] as PaymentMode[]).map((mode) => ({ label: MODE_LABELS[mode], onSelect: () => doPay(paying, mode) })) : []}
          />
        </>
      }
    >
      {bills.isPending || meters.isPending ? (
        <CardSkeleton rows={4} />
      ) : bills.isError || meters.isError ? (
        <LoadFailed what="Electricity" error={bills.error ?? meters.error} onRetry={() => (bills.refetch(), meters.refetch())} />
      ) : !meters.data?.length ? (
        <Surface padded={false}>
          <StatusView compact kind="empty" icon={Plug} title="No meters yet" body={canLog ? 'Add the school’s meters, then their bills each month.' : 'The accounts office adds the school’s meters.'} />
        </Surface>
      ) : bills.data?.length ? (
        <ListGroup
          footer={canLog && unpaid.length ? 'Tap an unpaid bill to pay it.' : undefined}
          items={bills.data.slice(0, 60).map((row) => ({
            title: `${row.connectionSnapshot?.name ?? meterName(row.connectionId) ?? 'Meter'} · ${formatMonth(row.billMonth)}`,
            subtitle: [row.units ? `${row.units} units` : null, row.status === 'paid' && row.paidOn ? `paid ${formatDate(row.paidOn)}` : row.dueDate ? `due ${formatDate(row.dueDate)}` : null].filter(Boolean).join(' · ') || undefined,
            value: formatINR(row.amount),
            badge: row.status === 'paid' ? { label: 'Paid', tone: 'success' as const } : { label: 'Unpaid', tone: 'warning' as const },
            lines: 2 as const,
            onPress: canLog && row.status === 'unpaid' ? () => setPaying(row) : undefined,
          }))}
        />
      ) : (
        <Surface padded={false}>
          <StatusView compact kind="empty" icon={Plus} title="No bills yet" body="Each month’s bill for each meter shows here." />
        </Surface>
      )}
    </MobileScreen>
  )
}
