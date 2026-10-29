import { useRouter } from 'expo-router'
import { Plus } from 'lucide-react-native'
import { useMemo, useState } from 'react'

import { ApiError } from '@/lib/api'
import { formatINR } from '@/lib/format'
import { CardSkeleton, LoadFailed } from '@/portal/states'
import type { PayrollSettings, SalaryComponent } from '@/services/salaryService'
import { RecordSheet, type RecordField, type RecordValues } from '@/staff/RecordSheet'
import { useArchiveSalaryComponent, usePayrollSettings, useSalaryComponents, useSavePayrollSettings, useSaveSalaryComponent } from '@/staff/salaryQueries'
import { ActionSheet, ListGroup, MobileScreen, NavBar, haptic, useToast } from '@/ui'

type Rate = 'pfRate' | 'pfWageCeiling' | 'esiEmployee' | 'esiEmployer' | 'esiGrossLimit'

const RATES: { key: Rate; label: string; show: (n: number) => string; hint: string }[] = [
  { key: 'pfRate', label: 'PF rate (%)', show: (n) => `${n}%`, hint: 'Of basic, from the employee and again from the school.' },
  { key: 'pfWageCeiling', label: 'PF wage cap (₹)', show: (n) => formatINR(n), hint: 'PF on basic up to this, for people with the cap on.' },
  { key: 'esiEmployee', label: 'ESI from the employee (%)', show: (n) => `${n}%`, hint: 'Of gross.' },
  { key: 'esiEmployer', label: 'ESI from the school (%)', show: (n) => `${n}%`, hint: 'Of gross.' },
  { key: 'esiGrossLimit', label: 'ESI applies up to a gross of (₹)', show: (n) => formatINR(n), hint: 'Above this gross there is no ESI.' },
]

const SLAB_FIELDS: RecordField[] = [
  { key: 'min', label: 'Gross from (₹)', kind: 'number', placeholder: '15001', required: true },
  { key: 'max', label: 'Gross up to (₹, optional)', kind: 'number', placeholder: 'Leave empty for no upper limit' },
  { key: 'amount', label: 'PT a month (₹)', kind: 'number', placeholder: '200', required: true },
]

const COMPONENT_FIELDS: RecordField[] = [
  { key: 'name', label: 'Name', kind: 'text', placeholder: 'Medical allowance', required: true },
  { key: 'code', label: 'Short code', kind: 'text', placeholder: 'MED', required: true, hint: 'PF, ESI, PT and TDS are worked out on their own; use another code.' },
  {
    key: 'type',
    label: 'Kind',
    kind: 'choice',
    options: [
      { value: 'earning', label: 'Earning' },
      { value: 'deduction', label: 'Deduction' },
    ],
  },
  {
    key: 'calc',
    label: 'Worked out as',
    kind: 'choice',
    options: [
      { value: 'fixed', label: 'An amount' },
      { value: 'percent_of_basic', label: 'A percent of basic' },
      { value: 'percent_of_gross', label: 'A percent of gross' },
    ],
  },
  { key: 'defaultValue', label: 'Starting value (optional)', kind: 'number', placeholder: '0' },
]

const calcText = (component: SalaryComponent) =>
  `${component.type === 'deduction' ? 'Deduction · ' : ''}${component.calc === 'fixed' ? 'an amount' : component.calc === 'percent_of_basic' ? '% of basic' : '% of gross'}${component.defaultValue ? ` · starts at ${component.defaultValue}` : ''}`

/**
 * PF, ESI and PT for the school (the website's Payroll settings) and the pay lines its salaries use.
 * Each rate saves on its own; PT slabs save as the whole list. Removing a pay line keeps it on the
 * salaries that already have it.
 */
export default function PayrollSettingsScreen() {
  const router = useRouter()
  const toast = useToast()
  const settings = usePayrollSettings()
  const components = useSalaryComponents()
  const saveSettings = useSavePayrollSettings()
  const saveComponent = useSaveSalaryComponent()
  const archive = useArchiveSalaryComponent()
  const [rate, setRate] = useState<Rate | null>(null)
  const [slab, setSlab] = useState<{ index: number | null } | null>(null)
  const [component, setComponent] = useState<{ row?: SalaryComponent } | null>(null)
  const [removing, setRemoving] = useState<SalaryComponent | null>(null)
  const [error, setError] = useState<string | null>(null)
  const data = settings.data
  const slabs = [...(data?.ptSlabs ?? [])].sort((a, b) => a.min - b.min)

  const rateSpec = RATES.find((entry) => entry.key === rate)
  const rateInitial = useMemo<RecordValues>(() => ({ value: rate && data ? String(data[rate]) : '' }), [rate, data])
  const slabInitial = useMemo<RecordValues>(() => {
    const row = slab?.index != null ? slabs[slab.index] : null
    return { min: row ? String(row.min) : '', max: row?.max != null ? String(row.max) : '', amount: row ? String(row.amount) : '' }
  }, [slab, slabs])
  const componentInitial = useMemo<RecordValues>(
    () => ({
      name: component?.row?.name ?? '',
      code: component?.row?.code ?? '',
      type: component?.row?.type ?? 'earning',
      calc: component?.row?.calc ?? 'fixed',
      defaultValue: component?.row?.defaultValue ? String(component.row.defaultValue) : '',
    }),
    [component],
  )

  const fail = (failure: unknown) => {
    haptic.error()
    setError(failure instanceof ApiError ? failure.message : "It didn't save. Try again.")
  }

  const saveRate = async (values: RecordValues) => {
    if (!rate) return
    const value = Number(values.value)
    if (!Number.isFinite(value) || value < 0) return setError('Enter a number, 0 or more.')
    try {
      await saveSettings.mutateAsync({ [rate]: value } as Partial<PayrollSettings>)
      haptic.success()
      setRate(null)
      toast('Saved')
    } catch (failure) {
      fail(failure)
    }
  }

  const saveSlabs = async (next: PayrollSettings['ptSlabs'], done: string) => {
    try {
      await saveSettings.mutateAsync({ ptSlabs: next })
      haptic.success()
      setSlab(null)
      toast(done)
    } catch (failure) {
      fail(failure)
    }
  }

  const saveSlab = (_changes: RecordValues, all: RecordValues) => {
    const min = Number(all.min)
    const max = all.max ? Number(all.max) : null
    const amount = Number(all.amount)
    if (!Number.isFinite(min) || min < 0 || !Number.isFinite(amount) || amount < 0) return setError('Enter the gross it starts from and the PT amount.')
    if (max !== null && (!Number.isFinite(max) || max < min)) return setError('“Up to” is more than “from”, or empty.')
    const row = { min, max, amount }
    const next = slab?.index != null ? slabs.map((entry, index) => (index === slab.index ? row : entry)) : [...slabs, row]
    void saveSlabs(next, 'PT slabs saved')
  }

  const saveLine = async (changes: RecordValues) => {
    if (component?.row && !Object.keys(changes).length) return setComponent(null)
    const input: Partial<SalaryComponent> = { ...changes } as Partial<SalaryComponent>
    if (changes.code !== undefined) input.code = changes.code.toUpperCase()
    if (changes.defaultValue !== undefined) input.defaultValue = Number(changes.defaultValue) || 0
    try {
      await saveComponent.mutateAsync({ id: component?.row?._id, input })
      haptic.success()
      setComponent(null)
      toast(component?.row ? 'Pay line saved' : 'Pay line added')
    } catch (failure) {
      fail(failure)
    }
  }

  const doArchive = async () => {
    if (!removing) return
    const row = removing
    setRemoving(null)
    try {
      await archive.mutateAsync(row._id)
      haptic.medium()
      toast(`${row.name} removed`)
    } catch (failure) {
      haptic.error()
      toast(failure instanceof ApiError ? failure.message : "It wasn't removed. Try again.", 'danger')
    }
  }

  return (
    <MobileScreen
      refreshing={settings.isRefetching || components.isRefetching}
      onRefresh={() => (settings.refetch(), components.refetch())}
      nav={<NavBar title="PF, ESI and pay lines" back={{ label: 'Salaries', onPress: router.back }} />}
      overlay={
        <>
          <RecordSheet
            open={Boolean(rate)}
            onClose={() => setRate(null)}
            title={rateSpec?.label ?? ''}
            fields={[{ key: 'value', label: rateSpec?.label ?? '', kind: 'number', hint: rateSpec?.hint, required: true }]}
            initial={rateInitial}
            isNew={false}
            saving={saveSettings.isPending}
            error={error}
            onSave={(_changes, all) => saveRate(all)}
          />
          <RecordSheet
            open={Boolean(slab)}
            onClose={() => setSlab(null)}
            title={slab?.index != null ? 'PT slab' : 'Add a PT slab'}
            fields={SLAB_FIELDS}
            initial={slabInitial}
            isNew={slab?.index == null}
            saving={saveSettings.isPending}
            error={error}
            onSave={saveSlab}
            onRemove={
              slab?.index != null
                ? () =>
                    saveSlabs(
                      slabs.filter((_, index) => index !== slab.index),
                      'PT slab removed',
                    )
                : undefined
            }
            removeLabel="Remove slab"
          />
          <RecordSheet
            open={Boolean(component)}
            onClose={() => setComponent(null)}
            title={component?.row?.name ?? 'Add a pay line'}
            fields={component?.row?.code === 'BASIC' ? COMPONENT_FIELDS.filter((field) => field.key === 'name') : COMPONENT_FIELDS}
            initial={componentInitial}
            isNew={!component?.row}
            saving={saveComponent.isPending}
            error={error}
            onSave={saveLine}
            onRemove={component?.row && component.row.code !== 'BASIC' ? () => (setRemoving(component.row ?? null), setComponent(null)) : undefined}
            removeLabel="Remove pay line"
          />
          <ActionSheet
            open={Boolean(removing)}
            onClose={() => setRemoving(null)}
            title={`Remove ${removing?.name ?? ''}?`}
            message="Salaries that already have it keep their values."
            actions={[{ label: 'Remove pay line', tone: 'danger', onSelect: doArchive }]}
          />
        </>
      }
    >
      {settings.isPending || components.isPending ? (
        <CardSkeleton rows={8} />
      ) : settings.isError || components.isError || !data ? (
        <LoadFailed what="Payroll settings" error={settings.error ?? components.error} onRetry={() => (settings.refetch(), components.refetch())} />
      ) : (
        <>
          <ListGroup
            header="PF and ESI"
            items={RATES.map((entry) => ({
              title: entry.label.replace(/ \((%|₹)\)$/, ''),
              value: entry.show(Number(data[entry.key]) || 0),
              chevron: true,
              onPress: () => (setError(null), setRate(entry.key)),
            }))}
          />
          <ListGroup
            header="Professional tax"
            footer="PT a month by gross, as your state sets it. With no slabs, no PT is taken."
            items={[
              ...slabs.map((row, index) => ({
                title: row.max != null ? `${formatINR(row.min)} to ${formatINR(row.max)}` : `${formatINR(row.min)} and above`,
                value: formatINR(row.amount),
                chevron: true,
                onPress: () => (setError(null), setSlab({ index })),
              })),
              { title: 'Add a PT slab', icon: Plus, tile: 3 as const, onPress: () => (setError(null), setSlab({ index: null })) },
            ]}
          />
          <ListGroup
            header="Pay lines"
            footer="The lines a salary can have. Basic is needed on every salary."
            items={[
              ...(components.data ?? []).map((row) => ({
                title: row.name,
                subtitle: `${row.code} · ${calcText(row)}`,
                lines: 2 as const,
                chevron: true,
                onPress: () => (setError(null), setComponent({ row })),
              })),
              { title: 'Add a pay line', icon: Plus, tile: 3 as const, onPress: () => (setError(null), setComponent({})) },
            ]}
          />
        </>
      )}
    </MobileScreen>
  )
}
