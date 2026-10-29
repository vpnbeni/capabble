import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { TrendingUp } from 'lucide-react-native'
import { useState } from 'react'
import { View } from 'react-native'

import { ApiError } from '@/lib/api'
import { formatDayKey, formatINR, schoolToday } from '@/lib/format'
import { CardSkeleton, LoadFailed } from '@/portal/states'
import type { RevisionResult } from '@/services/salaryService'
import { salaryKeys, useReviseSalaries, useStaffSalaries } from '@/staff/salaryQueries'
import { space } from '@/theme/tokens'
import { ActionBar, BottomSheet, Callout, ListGroup, MobileScreen, MobileTextField, MonthPicker, NavBar, OptionList, SegmentedControl, haptic, useToast } from '@/ui'

type Mode = 'percent' | 'amount'

/**
 * Raise (or lower) several people's pay at once (the website's bulk revision): choose who, by a
 * percent or an amount a month, from a date. "See the change" shows each person's gross before and
 * after without saving; saving keeps it in each person's history. People without a salary are left out.
 */
export default function ReviseSalariesScreen() {
  const router = useRouter()
  const toast = useToast()
  const queryClient = useQueryClient()
  const list = useStaffSalaries()
  const revise = useReviseSalaries()
  const [ids, setIds] = useState<string[]>([])
  const [mode, setMode] = useState<Mode>('percent')
  const [value, setValue] = useState('')
  const [from, setFrom] = useState(schoolToday())
  const [note, setNote] = useState('')
  const [picking, setPicking] = useState<'people' | 'date' | null>(null)
  const [result, setResult] = useState<RevisionResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const withSalary = (list.data ?? []).filter((row) => row.salary)
  const change = Number(value.replace(/[^0-9.-]/g, ''))

  const run = async (preview: boolean) => {
    if (!ids.length) return setError('Choose who gets the change.')
    if (!Number.isFinite(change) || change === 0) return setError('Enter the change, such as 5 or −2.')
    setError(null)
    try {
      const data = await revise.mutateAsync({ teacherIds: ids, mode, value: change, effectiveFrom: from, note: note.trim() || undefined, preview })
      if (preview) return setResult(data)
      haptic.success()
      await queryClient.invalidateQueries({ queryKey: salaryKeys.all })
      toast(`${data.succeeded} ${data.succeeded === 1 ? 'salary' : 'salaries'} changed${data.failed.length ? `, ${data.failed.length} left as they were` : ''}`)
      router.back()
    } catch (failure) {
      haptic.error()
      setError(failure instanceof ApiError ? failure.message : "It didn't go through. Try again.")
    }
  }

  const ready = Boolean(result) && !revise.isPending

  return (
    <MobileScreen
      refreshing={list.isRefetching}
      onRefresh={list.refetch}
      nav={<NavBar title="Raise several" back={{ label: 'Salaries', onPress: router.back }} />}
      actionBar={
        <ActionBar
          icon={TrendingUp}
          summary={`${ids.length} ${ids.length === 1 ? 'person' : 'people'}`}
          detail={value ? (mode === 'percent' ? `${change > 0 ? '+' : ''}${change}%` : `${change > 0 ? '+' : '−'}${formatINR(Math.abs(change))} a month`) : 'Choose the change'}
          label={revise.isPending ? 'Working…' : ready ? 'Save the change' : 'See the change'}
          onPress={() => run(!ready)}
        />
      }
      overlay={
        <>
          <BottomSheet open={picking === 'people'} onClose={() => setPicking(null)} title="Who" detent="large">
            <OptionList
              multiple
              label="Who"
              header={ids.length === withSalary.length ? undefined : `${withSalary.length} people have a salary`}
              value={ids}
              onChange={(next) => (setIds(next), setResult(null))}
              options={withSalary.map((row) => ({ value: row.teacherId, label: row.name, meta: `gross ${formatINR(row.salary?.gross ?? 0)}` }))}
            />
          </BottomSheet>
          <BottomSheet open={picking === 'date'} onClose={() => setPicking(null)} title="Applies from">
            <MonthPicker label="Applies from" value={from} today={schoolToday()} onChange={(day) => (setFrom(day), setResult(null), setPicking(null))} />
          </BottomSheet>
        </>
      }
    >
      {list.isPending ? (
        <CardSkeleton rows={5} />
      ) : list.isError ? (
        <LoadFailed what="Salaries" error={list.error} onRetry={list.refetch} />
      ) : (
        <>
          {error ? (
            <Callout tone="danger" title="Not done">
              {error}
            </Callout>
          ) : null}
          <ListGroup
            items={[
              { title: 'Who', value: ids.length ? `${ids.length} chosen` : 'Choose', chevron: true, onPress: () => setPicking('people') },
              ...(withSalary.length && ids.length !== withSalary.length
                ? [{ title: 'Everyone with a salary', value: String(withSalary.length), onPress: () => (setIds(withSalary.map((row) => row.teacherId)), setResult(null)) }]
                : []),
              { title: 'Applies from', value: formatDayKey(from, { year: true }), chevron: true, onPress: () => setPicking('date') },
            ]}
          />
          <View style={{ gap: space['space-4'] }}>
            <SegmentedControl
              label="Change by"
              value={mode}
              onChange={(next) => (setMode(next), setResult(null))}
              options={[
                { value: 'percent', label: 'Percent' },
                { value: 'amount', label: 'Amount a month' },
              ]}
            />
            <MobileTextField
              label={mode === 'percent' ? 'Percent' : 'Amount (₹)'}
              value={value}
              onChangeText={(text) => (setValue(text.replace(/[^0-9.-]/g, '')), setResult(null))}
              keyboardType="numbers-and-punctuation"
              maxLength={9}
              hint={mode === 'percent' ? 'Up to 100; a minus lowers it (to −50).' : 'Added to the gross; a minus lowers it.'}
            />
            <MobileTextField label="Note (optional)" value={note} onChangeText={setNote} placeholder="Annual increment 2026" maxLength={200} />
          </View>
          {result ? (
            <ListGroup
              header="Gross a month, before and after"
              footer="Nothing is saved until you save the change."
              items={result.rows.map((row) => ({
                title: row.name,
                subtitle: row.error || undefined,
                value: row.error ? 'Left out' : `${formatINR(row.beforeGross)} → ${formatINR(row.afterGross)}`,
                lines: 2 as const,
              }))}
            />
          ) : null}
        </>
      )}
    </MobileScreen>
  )
}
