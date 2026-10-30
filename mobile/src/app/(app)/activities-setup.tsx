import { useRouter } from 'expo-router'
import { Flag, Plus } from 'lucide-react-native'
import { useMemo, useState } from 'react'

import { ApiError } from '@/lib/api'
import { CardSkeleton, LoadFailed } from '@/portal/states'
import type { SetupKind, SetupRecord } from '@/services/activityService'
import { useRemoveSetupRecord, useSaveSetupRecord, useSetupRecords } from '@/staff/activityQueries'
import { KINDS, valuesOf } from '@/staff/activitySetupKinds'
import { RecordSheet, type RecordValues } from '@/staff/RecordSheet'
import { useStaff } from '@/staff/useStaff'
import { ActionBar, ActionSheet, ChipRail, ListGroup, MobileScreen, NavBar, StatusView, Surface, haptic, useToast } from '@/ui'

// Houses, clubs and councils open on their own screen (logo, teachers, members, posts).
const HAS_SCREEN: SetupKind[] = ['houses', 'clubs', 'councils']

/**
 * Setting up activities (the website's Activities → Houses, Clubs, Sports, Tours, Functions and
 * Councils): add, change or remove each. Sports, tours and functions are one sheet each; a house,
 * club or council opens on its own screen. House points and certificates are on the Activities screen.
 */
export default function ActivitiesSetupScreen() {
  const router = useRouter()
  const toast = useToast()
  const staff = useStaff()
  const canWrite = staff.can('actvt.activities.write')
  const canRemove = staff.can('actvt.activities.delete')
  const [kind, setKind] = useState<SetupKind>('houses')
  const records = useSetupRecords(kind)
  const save = useSaveSetupRecord()
  const remove = useRemoveSetupRecord()
  const [open, setOpen] = useState<{ row?: SetupRecord } | null>(null)
  const [removing, setRemoving] = useState<SetupRecord | null>(null)
  const [error, setError] = useState<string | null>(null)
  const spec = KINDS[kind]
  const initial = useMemo(() => valuesOf(spec.fields, open?.row), [spec.fields, open])

  const doSave = async (changes: RecordValues) => {
    if (!open) return
    if (open.row && !Object.keys(changes).length) return setOpen(null)
    try {
      await save.mutateAsync({ kind, id: open.row?._id, input: changes })
      haptic.success()
      setOpen(null)
      toast(open.row ? 'Saved' : `${spec.one.charAt(0).toUpperCase()}${spec.one.slice(1)} added`)
    } catch (failure) {
      haptic.error()
      setError(failure instanceof ApiError ? failure.message : "It wasn't saved. Try again.")
    }
  }

  const doRemove = async () => {
    if (!removing) return
    const row = removing
    setRemoving(null)
    try {
      await remove.mutateAsync({ kind, id: row._id })
      haptic.medium()
      toast(`${String(row[spec.title] ?? '')} removed`)
    } catch (failure) {
      haptic.error()
      toast(failure instanceof ApiError ? failure.message : "It wasn't removed. Try again.", 'danger')
    }
  }

  const rows = records.data ?? []

  return (
    <MobileScreen
      refreshing={records.isRefetching}
      onRefresh={records.refetch}
      nav={<NavBar title="Set up activities" back={{ label: 'Activities', onPress: router.back }} />}
      actionBar={
        canWrite ? (
          <ActionBar
            icon={Plus}
            summary={`${rows.length} ${rows.length === 1 ? spec.one : spec.chip.toLowerCase()}`}
            detail="Add, change or remove"
            label={`Add a ${spec.one}`}
            onPress={() => (setError(null), setOpen({}))}
          />
        ) : undefined
      }
      overlay={
        <>
          <RecordSheet
            open={Boolean(open)}
            onClose={() => setOpen(null)}
            title={open?.row ? String(open.row[spec.title] ?? spec.one) : `Add a ${spec.one}`}
            fields={spec.fields}
            initial={initial}
            isNew={!open?.row}
            saving={save.isPending}
            error={error}
            onSave={doSave}
            onRemove={open?.row && canRemove ? () => (setRemoving(open.row ?? null), setOpen(null)) : undefined}
            removeLabel={`Remove ${spec.one}`}
          />
          <ActionSheet
            open={Boolean(removing)}
            onClose={() => setRemoving(null)}
            title={`Remove ${String(removing?.[spec.title] ?? '')}?`}
            message="It leaves the lists here and on the website."
            actions={[{ label: `Remove ${spec.one}`, tone: 'danger', onSelect: doRemove }]}
          />
        </>
      }
    >
      <ChipRail label="Show" value={kind} onChange={setKind} items={(Object.keys(KINDS) as SetupKind[]).map((id) => ({ id, label: KINDS[id].chip }))} />
      {records.isPending ? (
        <CardSkeleton rows={4} />
      ) : records.isError ? (
        <LoadFailed what={spec.chip} error={records.error} onRetry={records.refetch} />
      ) : rows.length ? (
        <ListGroup
          items={rows.map((row) => ({
            title: String(row[spec.title] ?? ''),
            subtitle: spec.subtitle(row) || undefined,
            lines: 2 as const,
            chevron: canWrite,
            onPress: !canWrite
              ? undefined
              : HAS_SCREEN.includes(kind)
                ? () => router.push({ pathname: '/activities-record', params: { kind, id: row._id } })
                : () => (setError(null), setOpen({ row })),
          }))}
        />
      ) : (
        <Surface padded={false}>
          <StatusView
            compact
            kind="empty"
            icon={Flag}
            title={`No ${spec.chip.toLowerCase()} yet`}
            body={canWrite ? `Add the school’s ${spec.chip.toLowerCase()} here.` : `The ${spec.chip.toLowerCase()} the school sets up show here.`}
          />
        </Surface>
      )}
    </MobileScreen>
  )
}
