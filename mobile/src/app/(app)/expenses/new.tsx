import { usePreventRemove, useRouter } from 'expo-router'
import { Receipt } from 'lucide-react-native'
import { useState } from 'react'
import { View } from 'react-native'

import { ApiError } from '@/lib/api'
import { formatDayKey, formatINR, schoolToday } from '@/lib/format'
import { CardSkeleton } from '@/portal/states'
import { MODE_LABELS, type PaymentMode } from '@/services/feeService'
import { useExpenseCategories, useRecordExpense, useRecordFuel, useVehicles } from '@/staff/expenseQueries'
import { space } from '@/theme/tokens'
import {
  ActionBar,
  ActionSheet,
  BottomSheet,
  Callout,
  ListGroup,
  MobileScreen,
  MobileTextField,
  MonthPicker,
  NavBar,
  OptionList,
  SegmentedControl,
  Switch,
  haptic,
  useToast,
} from '@/ui'

const MODES: PaymentMode[] = ['cash', 'upi', 'bank_transfer', 'cheque', 'card']
const money = (text: string) => Number(text.replace(/[^0-9.]/g, ''))

/**
 * Record what was paid as it is paid: an expense (what for, amount, category, to whom, how) or a
 * fuel fill for a school vehicle (litres, rate or amount, odometer). The bill photo waits for the
 * phone's photo picker; until then attach it on the website if the school keeps them.
 */
export default function RecordExpenseScreen() {
  const router = useRouter()
  const toast = useToast()
  const today = schoolToday()
  const categories = useExpenseCategories()
  const [kind, setKind] = useState<'expense' | 'fuel'>('expense')
  const vehicles = useVehicles(kind === 'fuel')
  const recordExpense = useRecordExpense()
  const recordFuel = useRecordFuel()
  const [title, setTitle] = useState('')
  const [amount, setAmount] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [payee, setPayee] = useState('')
  const [mode, setMode] = useState<PaymentMode>('cash')
  const [reference, setReference] = useState('')
  const [date, setDate] = useState(today)
  const [vehicleId, setVehicleId] = useState('')
  const [litres, setLitres] = useState('')
  const [rate, setRate] = useState('')
  const [odometer, setOdometer] = useState('')
  const [fullTank, setFullTank] = useState(true)
  const [station, setStation] = useState('')
  const [sheet, setSheet] = useState<'category' | 'mode' | 'date' | 'vehicle' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [leaving, setLeaving] = useState<null | (() => void)>(null)
  const [done, setDone] = useState(false)
  const saving = recordExpense.isPending || recordFuel.isPending
  const dirty = !done && Boolean(title || amount || litres)
  const allowLeaving = usePreventRemove(dirty && !saving, ({ repeat }) => setLeaving(() => repeat))

  const active = (categories.data ?? []).filter((row) => row.isActive !== false)
  const category = active.find((row) => row._id === categoryId)
  const vehicle = vehicles.data?.find((row) => row._id === vehicleId)
  const fuelAmount = amount ? money(amount) : money(litres) * money(rate)
  const shown = kind === 'fuel' ? fuelAmount : money(amount)

  const fail = (message: string) => {
    haptic.error()
    setError(message)
  }

  const submit = async () => {
    try {
      if (kind === 'expense') {
        if (!title.trim()) return fail('Write what it was for, such as "Printer toner".')
        if (!(money(amount) > 0)) return fail('Enter the amount paid.')
        if (!categoryId) return fail('Choose a category.')
        await recordExpense.mutateAsync({ title: title.trim(), amount: money(amount), date, categoryId, payee: payee.trim(), mode, reference: reference.trim() })
      } else {
        if (!vehicleId) return fail('Choose the vehicle.')
        if (!(money(litres) > 0)) return fail('Enter the litres filled.')
        if (!(fuelAmount > 0)) return fail('Enter the amount, or the rate per litre.')
        await recordFuel.mutateAsync({
          vehicleId,
          date,
          litres: money(litres),
          ratePerLitre: rate ? money(rate) : undefined,
          amount: amount ? money(amount) : undefined,
          odometer: odometer ? money(odometer) : null,
          fullTank,
          station: station.trim(),
          mode,
        })
      }
      haptic.success()
      setDone(true)
      allowLeaving()
      toast(`${formatINR(shown)} recorded`)
      router.back()
    } catch (failure) {
      fail(failure instanceof ApiError ? failure.message : "It wasn't recorded. Check your connection and try again.")
    }
  }

  return (
    <MobileScreen
      nav={<NavBar title="Record an expense" back={{ label: 'Expenses', onPress: router.back }} />}
      actionBar={
        <ActionBar
          icon={Receipt}
          summary={shown > 0 ? formatINR(shown) : kind === 'fuel' ? 'Fuel' : 'Expense'}
          detail={`${kind === 'fuel' ? (vehicle?.busNo ?? vehicle?.registrationNumber ?? 'Choose a vehicle') : (category?.name ?? 'Choose a category')} · ${date === today ? 'today' : formatDayKey(date, { weekday: 'short' })}`}
          label={saving ? 'Saving…' : 'Record'}
          onPress={submit}
        />
      }
      overlay={
        <>
          <BottomSheet open={sheet !== null} onClose={() => setSheet(null)} detent={sheet === 'category' ? 'large' : 'medium'} title={{ category: 'Category', mode: 'Paid by', date: 'Date', vehicle: 'Vehicle' }[sheet ?? 'category']}>
            {sheet === 'category' ? (
              <OptionList label="Category" value={categoryId || null} onChange={(value) => (setCategoryId(value), setSheet(null))} options={active.map((row) => ({ value: row._id, label: row.name }))} />
            ) : sheet === 'mode' ? (
              <OptionList label="Paid by" value={mode} onChange={(value) => (setMode(value), setSheet(null))} options={MODES.map((value) => ({ value, label: MODE_LABELS[value] }))} />
            ) : sheet === 'vehicle' ? (
              <OptionList
                label="Vehicle"
                value={vehicleId || null}
                onChange={(value) => (setVehicleId(value), setSheet(null))}
                options={(vehicles.data ?? []).map((row) => ({ value: row._id, label: row.busNo || row.registrationNumber, meta: [row.registrationNumber, row.lastOdometer ? `last ${row.lastOdometer} km` : null].filter(Boolean).join(' · ') }))}
              />
            ) : sheet === 'date' ? (
              <MonthPicker value={date} today={today} onChange={(value) => (setDate(value > today ? today : value), setSheet(null))} />
            ) : null}
          </BottomSheet>
          <ActionSheet open={Boolean(leaving)} onClose={() => setLeaving(null)} title="Leave without recording?" actions={[{ label: 'Leave', tone: 'danger', onSelect: () => leaving?.() }]} cancelLabel="Keep entering" />
        </>
      }
    >
      {categories.isPending ? (
        <CardSkeleton rows={4} />
      ) : (
        <>
          {error ? (
            <Callout tone="danger" title="Not recorded">
              {error}
            </Callout>
          ) : null}
          <SegmentedControl
            label="What"
            value={kind}
            onChange={(next) => {
              setKind(next)
              setError(null)
            }}
            options={[
              { value: 'expense', label: 'Expense' },
              { value: 'fuel', label: 'Fuel fill' },
            ]}
          />
          {kind === 'expense' ? (
            <>
              <View style={{ gap: space['space-4'] }}>
                <MobileTextField label="What for" value={title} onChangeText={setTitle} placeholder="Printer toner" maxLength={160} />
                <MobileTextField label="Amount (₹)" type="number" value={amount} onChangeText={setAmount} maxLength={10} />
                <MobileTextField label="Paid to (optional)" value={payee} onChangeText={setPayee} placeholder="Sharma Stationers" maxLength={120} />
              </View>
              <ListGroup
                items={[
                  { title: 'Category', value: category?.name ?? 'Choose', onPress: () => setSheet('category') },
                  { title: 'Paid by', value: MODE_LABELS[mode], onPress: () => setSheet('mode') },
                  { title: 'Date', value: date === today ? 'Today' : formatDayKey(date, { weekday: 'short' }), onPress: () => setSheet('date') },
                ]}
              />
              {mode !== 'cash' ? <MobileTextField label="Reference (optional)" value={reference} onChangeText={setReference} hint="Cheque number or the UTR of the payment." maxLength={60} /> : null}
            </>
          ) : (
            <>
              <ListGroup
                items={[
                  { title: 'Vehicle', value: vehicle ? vehicle.busNo || vehicle.registrationNumber : 'Choose', onPress: () => setSheet('vehicle') },
                  { title: 'Date', value: date === today ? 'Today' : formatDayKey(date, { weekday: 'short' }), onPress: () => setSheet('date') },
                  { title: 'Paid by', value: MODE_LABELS[mode], onPress: () => setSheet('mode') },
                ]}
              />
              <View style={{ gap: space['space-4'] }}>
                <MobileTextField label="Litres" type="number" value={litres} onChangeText={setLitres} maxLength={7} />
                <MobileTextField label="Rate per litre (₹)" type="number" value={rate} onChangeText={setRate} maxLength={7} />
                <MobileTextField label="Amount (₹)" type="number" value={amount} onChangeText={setAmount} hint={!amount && litres && rate ? `Works out to ${formatINR(fuelAmount)}.` : 'Leave empty to work it out from the rate.'} maxLength={9} />
                <MobileTextField label="Odometer (km, optional)" type="number" value={odometer} onChangeText={setOdometer} maxLength={8} />
                <MobileTextField label="Pump (optional)" value={station} onChangeText={setStation} maxLength={120} />
              </View>
              <ListGroup items={[{ title: 'Full tank', accessory: <Switch label="Full tank" value={fullTank} onChange={setFullTank} /> }]} />
            </>
          )}
        </>
      )}
    </MobileScreen>
  )
}
