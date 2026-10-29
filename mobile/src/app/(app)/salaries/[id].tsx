import { useLocalSearchParams, usePreventRemove, useRouter } from 'expo-router'
import { Wallet } from 'lucide-react-native'
import { useMemo, useState } from 'react'
import { View } from 'react-native'

import { ApiError } from '@/lib/api'
import { formatDayKey, formatINR, schoolToday } from '@/lib/format'
import { CardSkeleton, LoadFailed } from '@/portal/states'
import type { SalaryCalc, SalaryComponent, SalaryLine, SalaryOptions } from '@/services/salaryService'
import { usePayPreview, usePayrollSettings, useSalaryComponents, useSaveSalary, useStaffSalary } from '@/staff/salaryQueries'
import { space } from '@/theme/tokens'
import { ActionBar, ActionSheet, BottomSheet, Callout, ListGroup, MobileButton, MobileScreen, MobileTextField, MonthPicker, NavBar, Section, SegmentedControl, Switch, haptic, useToast } from '@/ui'

const DEFAULT_OPTIONS: SalaryOptions = { pf: true, pfWageCap: true, esi: 'auto', tdsMonthly: 0 }
const CALCS: { value: SalaryCalc; label: string }[] = [
  { value: 'fixed', label: 'Amount' },
  { value: 'percent_of_basic', label: '% of basic' },
  { value: 'percent_of_gross', label: '% of gross' },
]

const lineValue = (line: Pick<SalaryLine, 'calc' | 'value'>) =>
  !line.value ? 'None' : line.calc === 'fixed' ? formatINR(line.value) : `${line.value}% of ${line.calc === 'percent_of_basic' ? 'basic' : 'gross'}`

/** Every pay line the school uses, with this person's value (0 when they don't get it), in the school's order. */
const linesFor = (catalog: SalaryComponent[], saved: SalaryLine[]): SalaryLine[] => {
  const fromCatalog = catalog.map((component) => {
    const line = saved.find((entry) => entry.componentId === component._id || entry.code === component.code)
    return { componentId: component._id, code: component.code, name: component.name, type: component.type, calc: line?.calc ?? component.calc, value: line?.value ?? 0 }
  })
  const removed = saved.filter((line) => !catalog.some((component) => component._id === line.componentId || component.code === line.code))
  return [...fromCatalog, ...removed]
}

/**
 * One person's salary (the website's salary editor): each pay line as an amount or a percent of
 * basic or gross, PF (and its wage cap), ESI, monthly TDS, and from when it applies. The server
 * works the month out as you change it; saving keeps a change in gross in their history.
 */
export default function StaffSalaryScreen() {
  const router = useRouter()
  const toast = useToast()
  const { id } = useLocalSearchParams<{ id: string }>()
  const person = useStaffSalary(id)
  const catalog = useSalaryComponents()
  const settings = usePayrollSettings()
  const save = useSaveSalary()
  const structure = person.data?.structure ?? null

  const start = useMemo(() => {
    if (!catalog.data || !person.data) return null
    return {
      lines: linesFor(catalog.data, structure?.components ?? []),
      options: { ...DEFAULT_OPTIONS, ...(structure?.options ?? {}) },
      effectiveFrom: structure?.effectiveFrom ? structure.effectiveFrom.slice(0, 10) : schoolToday(),
      note: '',
    }
  }, [catalog.data, person.data, structure])
  const [edited, setEdited] = useState<typeof start>(null)
  const form = edited ?? start
  const dirty = Boolean(form && start && JSON.stringify(form) !== JSON.stringify(start))
  const [leaving, setLeaving] = useState<null | (() => void)>(null)
  const allowLeaving = usePreventRemove(dirty && !save.isPending, ({ repeat }) => setLeaving(() => repeat))
  const [line, setLine] = useState<{ index: number; calc: SalaryCalc; value: string } | null>(null)
  const [tds, setTds] = useState<string | null>(null)
  const [pickingDate, setPickingDate] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const paid = form?.lines.filter((entry) => entry.value > 0) ?? null
  const preview = usePayPreview(paid, form?.options ?? null)

  const update = (patch: Partial<NonNullable<typeof start>>) => form && setEdited({ ...form, ...patch })
  const setOption = (patch: Partial<SalaryOptions>) => form && update({ options: { ...form.options, ...patch } })

  const saveLine = () => {
    if (!form || !line) return
    const value = Number(line.value || 0)
    if (!Number.isFinite(value) || value < 0) return setError('Enter an amount of 0 or more.')
    if (line.calc !== 'fixed' && value > 100) return setError('A percent is 100 or less.')
    setError(null)
    update({ lines: form.lines.map((entry, index) => (index === line.index ? { ...entry, calc: line.calc, value } : entry)) })
    setLine(null)
  }

  const submit = async () => {
    if (!form) return
    if (!form.lines.some((entry) => entry.code === 'BASIC' && entry.value > 0)) return setError('Enter the basic pay.')
    try {
      await save.mutateAsync({
        teacherId: id,
        input: {
          components: form.lines.filter((entry) => entry.value > 0).map((entry) => ({ componentId: entry.componentId, code: entry.code, calc: entry.calc, value: entry.value })),
          options: form.options,
          effectiveFrom: form.effectiveFrom,
          note: form.note.trim() || undefined,
        },
      })
      haptic.success()
      allowLeaving()
      setEdited(null)
      setError(null)
      toast('Salary saved')
    } catch (failure) {
      haptic.error()
      setError(failure instanceof ApiError ? failure.message : "It didn't save. Try again.")
    }
  }

  const name = person.data?.teacher.name ?? 'Salary'
  const current = line && form ? form.lines[line.index] : null
  const month = preview.data
  const groups: ['earning' | 'deduction', string][] = [
    ['earning', 'Earnings'],
    ['deduction', 'Deductions'],
  ]

  return (
    <MobileScreen
      refreshing={person.isRefetching}
      onRefresh={() => (person.refetch(), catalog.refetch())}
      nav={<NavBar title={name} back={{ label: 'Salaries', onPress: router.back }} />}
      actionBar={
        dirty && form ? (
          <ActionBar
            icon={Wallet}
            summary={month ? `${formatINR(month.net)} take-home` : 'Salary'}
            detail={`From ${formatDayKey(form.effectiveFrom, { year: true })}`}
            label={save.isPending ? 'Saving…' : 'Save'}
            onPress={submit}
          />
        ) : undefined
      }
      overlay={
        <>
          <ActionSheet
            open={Boolean(leaving)}
            onClose={() => setLeaving(null)}
            title="Discard your changes?"
            actions={[{ label: 'Discard', tone: 'danger', onSelect: () => leaving?.() }]}
            cancelLabel="Keep editing"
          />
          <BottomSheet
            open={Boolean(line)}
            onClose={() => setLine(null)}
            title={current?.name ?? ''}
            footer={
              <MobileButton fullWidth onPress={saveLine}>
                Done
              </MobileButton>
            }
          >
            {line && current ? (
              <View style={{ gap: space['space-4'] }}>
                {current.code !== 'BASIC' ? (
                  <SegmentedControl
                    label="Worked out as"
                    value={line.calc}
                    onChange={(calc) => setLine({ ...line, calc })}
                    options={CALCS.map((entry) => ({ value: entry.value, label: entry.label }))}
                  />
                ) : null}
                <MobileTextField
                  label={line.calc === 'fixed' ? 'Amount a month (₹)' : 'Percent'}
                  type="number"
                  value={line.value}
                  onChangeText={(value) => setLine({ ...line, value: value.replace(/[^0-9.]/g, '') })}
                  maxLength={9}
                  hint={current.code === 'BASIC' ? 'Needed for every salary.' : '0 takes it off this salary.'}
                  error={error ?? undefined}
                />
              </View>
            ) : null}
          </BottomSheet>
          <BottomSheet
            open={tds !== null}
            onClose={() => setTds(null)}
            title="TDS a month"
            footer={
              <MobileButton fullWidth onPress={() => (setOption({ tdsMonthly: Number(tds || 0) || 0 }), setTds(null))}>
                Done
              </MobileButton>
            }
          >
            <MobileTextField
              label="Amount (₹)"
              type="number"
              value={tds ?? ''}
              onChangeText={(value) => setTds(value.replace(/\D/g, ''))}
              maxLength={7}
              hint="Income tax taken each month; 0 for none."
            />
          </BottomSheet>
          <BottomSheet open={pickingDate} onClose={() => setPickingDate(false)} title="Applies from">
            <MonthPicker label="Applies from" value={form?.effectiveFrom ?? null} today={schoolToday()} onChange={(effectiveFrom) => (update({ effectiveFrom }), setPickingDate(false))} />
          </BottomSheet>
        </>
      }
    >
      {person.isPending || catalog.isPending ? (
        <CardSkeleton rows={8} />
      ) : person.isError || catalog.isError || !form ? (
        <LoadFailed what="The salary" error={person.error ?? catalog.error} onRetry={() => (person.refetch(), catalog.refetch())} />
      ) : (
        <>
          {error && !line ? (
            <Callout tone="danger" title="Not saved">
              {error}
            </Callout>
          ) : null}
          {!structure ? (
            <Callout tone="info" title="No salary yet">
              Enter the basic pay and any allowances, then save.
            </Callout>
          ) : null}
          {groups.map(([type, title]) => (
            <ListGroup
              key={type}
              header={title}
              items={form.lines
                .map((entry, index) => ({ entry, index }))
                .filter(({ entry }) => entry.type === type)
                .map(({ entry, index }) => ({
                  title: entry.name,
                  value: lineValue(entry),
                  chevron: true,
                  onPress: () => (
                    setError(null),
                    setLine({ index, calc: entry.calc, value: entry.value ? String(entry.value) : String(catalog.data?.find((component) => component._id === entry.componentId)?.defaultValue || '') })
                  ),
                }))}
            />
          ))}
          <ListGroup
            header="Taken by law"
            footer={
              settings.data
                ? `PF ${settings.data.pfRate}%${form.options.pfWageCap ? ` of basic up to ${formatINR(settings.data.pfWageCeiling)}` : ' of basic'}; ESI ${settings.data.esiEmployee}% while gross is ${formatINR(settings.data.esiGrossLimit)} or less; PT from the school's slabs.`
                : undefined
            }
            items={[
              { title: 'Provident Fund', accessory: <Switch label="Provident Fund" value={form.options.pf} onChange={(pf) => setOption({ pf })} /> },
              ...(form.options.pf
                ? [{ title: 'PF on the capped wage', accessory: <Switch label="PF on the capped wage" value={form.options.pfWageCap} onChange={(pfWageCap) => setOption({ pfWageCap })} /> }]
                : []),
              { title: 'ESI', accessory: <Switch label="ESI" value={form.options.esi === 'auto'} onChange={(on) => setOption({ esi: on ? 'auto' : 'off' })} /> },
              {
                title: 'TDS a month',
                value: form.options.tdsMonthly ? formatINR(form.options.tdsMonthly) : 'None',
                chevron: true,
                onPress: () => setTds(form.options.tdsMonthly ? String(form.options.tdsMonthly) : ''),
              },
            ]}
          />
          <ListGroup header="When" items={[{ title: 'Applies from', value: formatDayKey(form.effectiveFrom, { year: true }), chevron: true, onPress: () => setPickingDate(true) }]} />
          {dirty ? <MobileTextField label="Note (optional)" value={form.note} onChangeText={(note) => update({ note })} placeholder="Annual increment" maxLength={200} /> : null}
          <Section title="Each month">
            {month ? (
              <ListGroup
                footer={preview.isFetching ? 'Working it out…' : 'For a full month with no unpaid days.'}
                items={[
                  ...month.earnings.map((entry) => ({ title: entry.name, value: formatINR(entry.amount) })),
                  { title: 'Gross', value: formatINR(month.gross) },
                  ...month.deductions.map((entry) => ({ title: entry.name, value: `− ${formatINR(entry.amount)}` })),
                  { title: 'Take-home', value: formatINR(month.net) },
                  { title: 'Cost to the school', subtitle: 'Gross with the school’s PF and ESI', value: formatINR(month.employerCost) },
                ]}
              />
            ) : (
              <Callout tone="info" title="Enter the basic pay">
                The month is worked out once there is a basic pay.
              </Callout>
            )}
          </Section>
          {structure?.revisions?.length ? (
            <ListGroup
              header="History"
              items={[...structure.revisions]
                .reverse()
                .slice(0, 6)
                .map((entry) => ({
                  title: entry.note || 'Revised',
                  subtitle: `From ${formatDayKey(String(entry.effectiveFrom).slice(0, 10), { year: true })}`,
                  value: `${formatINR(entry.fromGross)} → ${formatINR(entry.toGross)}`,
                  lines: 2 as const,
                }))}
            />
          ) : null}
        </>
      )}
    </MobileScreen>
  )
}
