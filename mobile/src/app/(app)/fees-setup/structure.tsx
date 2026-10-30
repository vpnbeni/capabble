import { useLocalSearchParams, usePreventRemove, useRouter } from 'expo-router'
import { Ellipsis, Layers, Plus } from 'lucide-react-native'
import { useMemo, useState } from 'react'

import { ApiError } from '@/lib/api'
import { classLabel, formatINR } from '@/lib/format'
import { CardSkeleton, LoadFailed } from '@/portal/states'
import { FREQUENCY_LABELS, type FeeStructure, type Frequency, type StructureComponent, type StructureInput } from '@/services/feeSetupService'
import { RecordSheet, type RecordField, type RecordValues } from '@/staff/RecordSheet'
import { useArchiveStructure, useAssignStructure, useDuplicateStructure, useFeeHeads, useFeeStructures, useSaveStructure } from '@/staff/feeSetupQueries'
import { useClassSections } from '@/staff/queries'
import { useStaff } from '@/staff/useStaff'
import { ActionBar, ActionSheet, BottomSheet, Callout, Dialog, ListGroup, MobileButton, MobileScreen, MobileTextField, NavBar, OptionList, haptic, useToast } from '@/ui'

type Draft = { name: string; classes: string[]; components: StructureComponent[]; dueDay: string }

const fromStructure = (row?: FeeStructure): Draft => ({
  name: row?.name ?? '',
  classes: row?.applicableClasses ?? [],
  components: row?.components ?? [],
  dueDay: String(row?.installmentPlan?.dueDay ?? 10),
})

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

/**
 * One fee structure (the website's Finance → Fee structures → edit): its name, the classes it is for,
 * each fee with its amount and how often, and the day fees fall due. Saving sends only what changed
 * (the fee list and classes go whole). From More: assign it to its classes (adds the fees to every
 * student), duplicate it for next year, archive it.
 */
export default function FeeStructureScreen() {
  const router = useRouter()
  const toast = useToast()
  const staff = useStaff()
  const canEdit = staff.can('cpitl.finance.manage_structures')
  const { id } = useLocalSearchParams<{ id?: string }>()
  const structures = useFeeStructures()
  const heads = useFeeHeads()
  const sections = useClassSections(true)
  const save = useSaveStructure()
  const assign = useAssignStructure()
  const duplicate = useDuplicateStructure()
  const archive = useArchiveStructure()
  const row = id ? structures.data?.find((entry) => entry._id === id) : undefined
  const saved = useMemo(() => fromStructure(row), [row])
  const [edited, setDraft] = useState<Draft | null>(null)
  const draft = edited ?? saved
  const [componentSheet, setComponentSheet] = useState<{ index?: number; values: RecordValues } | null>(null)
  const [choosingClasses, setChoosingClasses] = useState(false)
  const [menu, setMenu] = useState(false)
  const [confirm, setConfirm] = useState<'assign' | 'archive' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [leaving, setLeaving] = useState<null | (() => void)>(null)
  const dirty = edited !== null && !same(edited, saved)
  const allowLeaving = usePreventRemove(!done && dirty && !save.isPending, ({ repeat }) => setLeaving(() => repeat))
  const readOnly = !canEdit || row?.status === 'archived'

  const classNames = [...new Set((sections.data ?? []).map((entry) => entry.className))]
  const headOptions = (heads.data ?? []).map((head) => ({ value: head._id, label: head.name }))
  const componentFields: RecordField[] = [
    { key: 'amount', label: 'Amount each time', kind: 'number', placeholder: '1500', required: true },
    { key: 'feeHead', label: 'Fee', kind: 'choice', options: headOptions },
    { key: 'frequency', label: 'Charged', kind: 'choice', options: (Object.keys(FREQUENCY_LABELS) as Frequency[]).map((value) => ({ value, label: FREQUENCY_LABELS[value] })) },
    { key: 'isOptional', label: 'For everyone', kind: 'choice', options: [{ value: 'no', label: 'Everyone pays' }, { value: 'yes', label: 'Only those who opt in' }] },
  ]

  const openComponent = (index?: number) => {
    const entry = index !== undefined ? draft.components[index] : undefined
    setError(null)
    setComponentSheet({ index, values: { amount: entry ? String(entry.amount) : '', feeHead: entry?.feeHead ?? '', frequency: entry?.frequency ?? 'monthly', isOptional: entry?.isOptional ? 'yes' : 'no' } })
  }

  const keepComponent = (_: RecordValues, all: RecordValues) => {
    const head = heads.data?.find((entry) => entry._id === all.feeHead)
    if (!head) return setError('Choose the fee.')
    const amount = Number(all.amount)
    if (!(amount >= 0)) return setError('Enter the amount.')
    const entry: StructureComponent = { feeHead: head._id, name: head.name, code: head.code, amount, frequency: all.frequency as Frequency, isOptional: all.isOptional === 'yes' }
    const index = componentSheet?.index
    const components = index !== undefined ? draft.components.map((item, i) => (i === index ? entry : item)) : [...draft.components, entry]
    setDraft({ ...draft, components })
    setComponentSheet(null)
  }

  const submit = async () => {
    if (!draft.name.trim()) return (haptic.error(), setError('Give the structure a name, like “Class 7 fees 2026-27”.'))
    const dueDay = Number.parseInt(draft.dueDay, 10)
    if (!(dueDay >= 1 && dueDay <= 28)) return (haptic.error(), setError('Fees fall due on a day from 1 to 28.'))
    const input: StructureInput = {}
    if (!row || draft.name.trim() !== saved.name) input.name = draft.name.trim()
    if (!row || !same(draft.classes, saved.classes)) input.applicableClasses = draft.classes
    if (!row || !same(draft.components, saved.components)) input.components = draft.components
    if (!row || dueDay !== Number(saved.dueDay)) input.installmentPlan = { ...(row?.installmentPlan ?? {}), dueDay }
    try {
      const result = await save.mutateAsync({ id: row?._id, input })
      haptic.success()
      setDone(true)
      allowLeaving()
      setDraft(null)
      setError(null)
      toast(row ? `Saved as version ${result.version ?? ''}`.trim() : 'Saved as a draft')
      if (!row) router.replace({ pathname: '/fees-setup/structure', params: { id: result._id } })
      else setDone(false)
    } catch (failure) {
      haptic.error()
      setError(failure instanceof ApiError ? failure.message : "It wasn't saved. Try again.")
    }
  }

  const act = async (what: 'assign' | 'archive' | 'duplicate') => {
    if (!row) return
    setConfirm(null)
    setMenu(false)
    try {
      if (what === 'assign') {
        const result = await assign.mutateAsync({ id: row._id, classes: row.applicableClasses })
        toast(`Fees added for ${result.students} ${result.students === 1 ? 'student' : 'students'}`)
      } else if (what === 'archive') {
        await archive.mutateAsync(row._id)
        toast('Archived')
      } else {
        const copy = await duplicate.mutateAsync(row._id)
        toast('Copied as a draft')
        router.replace({ pathname: '/fees-setup/structure', params: { id: copy._id } })
      }
      haptic.success()
    } catch (failure) {
      haptic.error()
      toast(failure instanceof ApiError ? failure.message : "That didn't work. Try again.", 'danger')
    }
  }

  const loading = structures.isPending || heads.isPending

  return (
    <MobileScreen
      nav={<NavBar title={row?.name ?? 'New structure'} back={{ label: 'Fees', onPress: router.back }} actions={row && canEdit ? [{ icon: Ellipsis, label: 'More', onPress: () => setMenu(true) }] : []} />}
      actionBar={!readOnly && (dirty || !row) ? <ActionBar icon={Layers} summary={draft.name.trim() || 'New structure'} detail={`${draft.components.length} ${draft.components.length === 1 ? 'fee' : 'fees'} · ${draft.classes.length} ${draft.classes.length === 1 ? 'class' : 'classes'}`} label={save.isPending ? 'Saving…' : 'Save'} onPress={submit} /> : undefined}
      overlay={
        <>
          <RecordSheet
            open={Boolean(componentSheet)}
            onClose={() => setComponentSheet(null)}
            title={componentSheet?.index !== undefined ? draft.components[componentSheet.index]?.name ?? 'Fee' : 'Add a fee'}
            fields={componentFields}
            initial={componentSheet?.values ?? {}}
            isNew={componentSheet?.index === undefined}
            saving={false}
            error={error}
            onSave={keepComponent}
            onRemove={componentSheet?.index !== undefined ? () => (setDraft({ ...draft, components: draft.components.filter((_, i) => i !== componentSheet.index) }), setComponentSheet(null)) : undefined}
            removeLabel="Take off this structure"
          />
          <BottomSheet open={choosingClasses} onClose={() => setChoosingClasses(false)} title="For classes" detent="large" footer={<MobileButton fullWidth onPress={() => setChoosingClasses(false)}>Done</MobileButton>}>
            <OptionList multiple label="Classes" value={draft.classes} onChange={(classes) => setDraft({ ...draft, classes })} options={classNames.map((value) => ({ value, label: classLabel(value) }))} />
          </BottomSheet>
          <ActionSheet
            open={menu}
            onClose={() => setMenu(false)}
            title={row?.name ?? ''}
            actions={[
              ...(row && row.status !== 'archived' ? [{ label: 'Assign to its classes', onSelect: () => (setMenu(false), setConfirm('assign')) }] : []),
              { label: 'Duplicate', onSelect: () => act('duplicate') },
              ...(row && row.status !== 'archived' ? [{ label: 'Archive', tone: 'danger' as const, onSelect: () => (setMenu(false), setConfirm('archive')) }] : []),
            ]}
          />
          <Dialog
            open={Boolean(confirm)}
            onClose={() => setConfirm(null)}
            tone={confirm === 'archive' ? 'danger' : 'default'}
            title={confirm === 'assign' ? `Assign to ${row?.applicableClasses.map((name) => classLabel(name)).join(', ') || 'its classes'}?` : 'Archive this structure?'}
            description={confirm === 'assign' ? 'Every student of these classes gets these fees and their due dates. Families see them in the app.' : 'It can’t be changed or assigned after this; duplicate it to start again.'}
            footer={
              <>
                <MobileButton variant="gray" onPress={() => setConfirm(null)}>
                  Not now
                </MobileButton>
                <MobileButton variant={confirm === 'archive' ? 'destructive' : 'filled'} loading={assign.isPending || archive.isPending} onPress={() => confirm && act(confirm)}>
                  {confirm === 'assign' ? 'Assign' : 'Archive'}
                </MobileButton>
              </>
            }
          />
          <ActionSheet open={Boolean(leaving)} onClose={() => setLeaving(null)} title="Discard your changes?" actions={[{ label: 'Discard', tone: 'danger', onSelect: () => leaving?.() }]} cancelLabel="Keep editing" />
        </>
      }
    >
      {loading ? (
        <CardSkeleton rows={5} />
      ) : id && !row ? (
        <LoadFailed what="The fee structure" error={structures.error} onRetry={structures.refetch} />
      ) : (
        <>
          {error && !componentSheet ? (
            <Callout tone="danger" title="Not saved">
              {error}
            </Callout>
          ) : null}
          {row?.status === 'archived' ? (
            <Callout tone="info" title="Archived">
              It can’t be changed. Duplicate it from More to start again.
            </Callout>
          ) : null}
          <MobileTextField label="Name" value={draft.name} onChangeText={(name) => setDraft({ ...draft, name })} disabled={readOnly} maxLength={120} />
          <ListGroup
            items={[
              { title: 'For classes', value: draft.classes.length ? draft.classes.map((name) => classLabel(name)).join(', ') : 'Choose', lines: 2 as const, onPress: readOnly ? undefined : () => setChoosingClasses(true) },
            ]}
          />
          <MobileTextField label="Fees fall due on day" hint="Of the month the fee is charged, 1 to 28." type="number" value={draft.dueDay} onChangeText={(dueDay) => setDraft({ ...draft, dueDay: dueDay.replace(/[^0-9]/g, '') })} disabled={readOnly} maxLength={2} />
          <ListGroup
            header={row?.annualTotal && !dirty ? `Fees · ${formatINR(row.annualTotal)} a year` : 'Fees'}
            items={[
              ...draft.components.map((entry, index) => ({
                title: entry.name || 'Fee',
                subtitle: `${formatINR(entry.amount)} · ${FREQUENCY_LABELS[entry.frequency] ?? entry.frequency}${entry.isOptional ? ' · only those who opt in' : ''}`,
                lines: 2 as const,
                onPress: readOnly ? undefined : () => openComponent(index),
              })),
              ...(readOnly ? [] : [{ title: 'Add a fee', icon: Plus, tile: 3 as const, onPress: () => openComponent() }]),
            ]}
          />
        </>
      )}
    </MobileScreen>
  )
}
