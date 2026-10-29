import { useRouter } from 'expo-router'
import { Layers, PiggyBank, Plus, Tag } from 'lucide-react-native'
import { useMemo, useState } from 'react'

import { ApiError } from '@/lib/api'
import { classLabel, formatINR } from '@/lib/format'
import { CardSkeleton, LoadFailed } from '@/portal/states'
import { FREQUENCY_LABELS, type BudgetRow, type Frequency } from '@/services/feeSetupService'
import { RecordSheet, type RecordField, type RecordValues } from '@/staff/RecordSheet'
import { useAddFeeHead, useBudgets, useCopyBudgets, useFeeHeads, useFeeStructures, useSaveBudget } from '@/staff/feeSetupQueries'
import { useStaff } from '@/staff/useStaff'
import { ActionBar, ChipRail, Dialog, ListGroup, MobileButton, MobileScreen, MobileTextField, NavBar, StatusView, Surface, haptic, useToast } from '@/ui'

type Tab = 'structures' | 'heads' | 'budgets'

const HEAD_FIELDS: RecordField[] = [
  { key: 'name', label: 'Name', kind: 'text', placeholder: 'Library Fee', required: true },
  { key: 'code', label: 'Short code', kind: 'text', placeholder: 'LIB', required: true },
  { key: 'frequency', label: 'Charged', kind: 'choice', options: (Object.keys(FREQUENCY_LABELS) as Frequency[]).map((value) => ({ value, label: FREQUENCY_LABELS[value] })) },
]
const STATUS: Record<string, { label: string; tone: 'success' | 'warning' | 'neutral' }> = {
  active: { label: 'In use', tone: 'success' },
  draft: { label: 'Draft', tone: 'warning' },
  archived: { label: 'Archived', tone: 'neutral' },
}
const GROUPS: Record<string, string> = { operating: 'Running costs', fuel: 'Fuel', electricity: 'Electricity', salary: 'Salaries', infra: 'Building' }

/**
 * Fee setup and budgets (the website's Finance → Fee structures, Fee heads and Budgets): the
 * structures with what a year costs and how many students pay them (each opens to change it,
 * assign it to its classes, duplicate or archive), the fee heads, and a budget per head against
 * what was spent. Late fees and instalment months stay as the website set them.
 */
export default function FeeSetupScreen() {
  const router = useRouter()
  const toast = useToast()
  const staff = useStaff()
  const canStructures = staff.can('cpitl.finance.manage_structures')
  const canBudgets = staff.can('cpitl.finance.budgets')
  const [tab, setTab] = useState<Tab>('structures')
  const structures = useFeeStructures()
  const heads = useFeeHeads()
  const budgets = useBudgets(canBudgets)
  const addHead = useAddFeeHead()
  const saveBudget = useSaveBudget()
  const copyBudgets = useCopyBudgets()
  const [addingHead, setAddingHead] = useState(false)
  const [budgetRow, setBudgetRow] = useState<BudgetRow | null>(null)
  const [amount, setAmount] = useState('')
  const [copying, setCopying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const emptyHead = useMemo<RecordValues>(() => ({ name: '', code: '', frequency: 'monthly' }), [])

  const fail = (failure: unknown, fallback: string) => {
    haptic.error()
    return failure instanceof ApiError ? failure.message : fallback
  }

  const doAddHead = async (_: RecordValues, all: RecordValues) => {
    if (!/^[A-Za-z0-9_-]{2,12}$/.test(all.code)) return setError('The code is 2 to 12 letters or digits, like LIB.')
    try {
      await addHead.mutateAsync({ name: all.name, code: all.code.toUpperCase(), frequency: all.frequency as Frequency })
      haptic.success()
      setAddingHead(false)
      toast(`${all.name} added`)
    } catch (failure) {
      setError(fail(failure, "It wasn't added. Try again."))
    }
  }

  const doSaveBudget = async () => {
    if (!budgetRow) return
    const value = Number(amount)
    if (!Number.isFinite(value) || value < 0) return toast('Enter an amount, 0 or more.', 'danger')
    try {
      await saveBudget.mutateAsync({ kind: budgetRow.kind, targetKey: budgetRow.targetKey, targetLabel: budgetRow.targetLabel, amount: value })
      haptic.success()
      setBudgetRow(null)
      toast(`${budgetRow.targetLabel}: ${formatINR(value)} a year`)
    } catch (failure) {
      toast(fail(failure, "The budget wasn't saved. Try again."), 'danger')
    }
  }

  const doCopy = async () => {
    setCopying(false)
    try {
      await copyBudgets.mutateAsync(0)
      haptic.success()
      toast('Budgets filled from last year’s spending')
    } catch (failure) {
      toast(fail(failure, "That didn't work. Try again."), 'danger')
    }
  }

  const list = structures.data ?? []
  const budgetRows = budgets.data ?? []
  const planned = budgetRows.reduce((sum, row) => sum + row.budget, 0)
  const spent = budgetRows.reduce((sum, row) => sum + row.actual, 0)

  const actionBar =
    tab === 'structures' && canStructures ? (
      <ActionBar icon={Layers} summary={`${list.filter((row) => row.status === 'active').length} in use`} detail="What each class pays in a year" label="New structure" onPress={() => router.push('/fees-setup/structure')} />
    ) : tab === 'heads' && canStructures ? (
      <ActionBar icon={Tag} summary={`${heads.data?.length ?? 0} fee heads`} detail="Tuition, transport, activity…" label="Add a fee head" onPress={() => (setError(null), setAddingHead(true))} />
    ) : tab === 'budgets' && canBudgets ? (
      <ActionBar icon={PiggyBank} summary={`${formatINR(spent)} of ${formatINR(planned)}`} detail="Spent of the year’s budget" label="Fill from last year" onPress={() => setCopying(true)} />
    ) : undefined

  return (
    <MobileScreen
      refreshing={structures.isRefetching || heads.isRefetching}
      onRefresh={() => (structures.refetch(), heads.refetch(), budgets.refetch())}
      nav={<NavBar title="Fees and budgets" back={{ label: 'Back', onPress: router.back }} />}
      actionBar={actionBar}
      overlay={
        <>
          <RecordSheet open={addingHead} onClose={() => setAddingHead(false)} title="Add a fee head" fields={HEAD_FIELDS} initial={emptyHead} isNew saving={addHead.isPending} error={error} onSave={doAddHead} />
          <Dialog
            open={Boolean(budgetRow)}
            onClose={() => setBudgetRow(null)}
            title={budgetRow?.targetLabel ?? ''}
            description={budgetRow ? `${formatINR(budgetRow.actual)} spent so far this year.` : undefined}
            footer={
              <>
                <MobileButton variant="gray" onPress={() => setBudgetRow(null)}>
                  Not now
                </MobileButton>
                <MobileButton loading={saveBudget.isPending} onPress={doSaveBudget}>
                  Save
                </MobileButton>
              </>
            }
          >
            <MobileTextField label="Budget for the year" type="number" prefix="₹" value={amount} onChangeText={(text) => setAmount(text.replace(/[^0-9.]/g, ''))} maxLength={12} />
          </Dialog>
          <Dialog
            open={copying}
            onClose={() => setCopying(false)}
            title="Fill budgets from last year?"
            description="Each head’s budget becomes what was spent on it last year. Budgets you set by hand are replaced."
            footer={
              <>
                <MobileButton variant="gray" onPress={() => setCopying(false)}>
                  Not now
                </MobileButton>
                <MobileButton loading={copyBudgets.isPending} onPress={doCopy}>
                  Fill
                </MobileButton>
              </>
            }
          />
        </>
      }
    >
      <ChipRail
        label="Show"
        value={tab}
        onChange={setTab}
        items={[
          { id: 'structures', label: 'Structures' },
          { id: 'heads', label: 'Fee heads' },
          ...(canBudgets ? [{ id: 'budgets' as const, label: 'Budgets' }] : []),
        ]}
      />
      {tab === 'structures' ? (
        structures.isPending ? (
          <CardSkeleton rows={4} />
        ) : structures.isError ? (
          <LoadFailed what="Fee structures" error={structures.error} onRetry={structures.refetch} />
        ) : list.length ? (
          <ListGroup
            items={list.map((row) => ({
              title: row.name,
              subtitle: [row.applicableClasses.map((name) => classLabel(name)).join(', ') || 'No class yet', row.annualTotal ? `${formatINR(row.annualTotal)} a year` : null, row.assignedCount ? `${row.assignedCount} ${row.assignedCount === 1 ? 'student' : 'students'}` : null].filter(Boolean).join(' · '),
              badge: STATUS[row.status],
              lines: 2 as const,
              chevron: true,
              onPress: () => router.push({ pathname: '/fees-setup/structure', params: { id: row._id } }),
            }))}
          />
        ) : (
          <Surface padded={false}>
            <StatusView compact kind="empty" icon={Layers} title="No fee structures yet" body="A structure says what a class pays and when." />
          </Surface>
        )
      ) : tab === 'heads' ? (
        heads.isPending ? (
          <CardSkeleton rows={4} />
        ) : heads.isError ? (
          <LoadFailed what="Fee heads" error={heads.error} onRetry={heads.refetch} />
        ) : (
          <ListGroup items={(heads.data ?? []).map((row) => ({ title: row.name, subtitle: `${row.code} · ${FREQUENCY_LABELS[row.frequency] ?? row.frequency}` }))} />
        )
      ) : budgets.isPending ? (
        <CardSkeleton rows={6} />
      ) : budgets.isError ? (
        <LoadFailed what="Budgets" error={budgets.error} onRetry={budgets.refetch} />
      ) : (
        Object.entries(
          budgetRows.reduce<Record<string, BudgetRow[]>>((groups, row) => {
            const key = row.group ?? row.kind
            groups[key] = [...(groups[key] ?? []), row]
            return groups
          }, {}),
        ).map(([group, rows]) => (
          <ListGroup
            key={group}
            header={GROUPS[group] ?? group}
            items={rows.map((row) => ({
              title: row.targetLabel,
              subtitle: `${formatINR(row.actual)} spent${row.budget ? ` of ${formatINR(row.budget)}` : ' · no budget'}`,
              badge: row.usedPct !== null && row.usedPct > 100 ? { label: 'Over', tone: 'danger' as const } : undefined,
              lines: 2 as const,
              icon: row.budget ? undefined : Plus,
              onPress: () => (setAmount(row.budget ? String(row.budget) : ''), setBudgetRow(row)),
            }))}
          />
        ))
      )}
    </MobileScreen>
  )
}
