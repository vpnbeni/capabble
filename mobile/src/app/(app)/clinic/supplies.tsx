import { useRouter } from 'expo-router'
import { PackagePlus, Pill } from 'lucide-react-native'
import { useState } from 'react'
import { View } from 'react-native'

import { ApiError } from '@/lib/api'
import { CardSkeleton, LoadFailed } from '@/portal/states'
import type { ClinicSupply } from '@/services/clinicService'
import { useClinicSupplies, useSaveSupply } from '@/staff/queries'
import { useStaff } from '@/staff/useStaff'
import { space } from '@/theme/tokens'
import { ActionBar, BottomSheet, Callout, ChipRail, ListGroup, MobileButton, MobileScreen, MobileTextField, NavBar, SegmentedControl, StatusView, Surface, haptic, useToast } from '@/ui'

const low = (row: ClinicSupply) => row.quantityOnHand <= row.reorderLevel

/** The clinic's stock: what is low, take some out or put some in, set when to reorder, add a supply. */
export default function ClinicSuppliesScreen() {
  const router = useRouter()
  const toast = useToast()
  const staff = useStaff()
  const canWrite = staff.can('mdcl.clinic.write')
  const supplies = useClinicSupplies()
  const save = useSaveSupply()
  const [view, setView] = useState<'all' | 'low'>('all')
  const [open, setOpen] = useState<ClinicSupply | null>(null)
  const [adding, setAdding] = useState(false)
  const [direction, setDirection] = useState<'use' | 'add'>('use')
  const [count, setCount] = useState('')
  const [reorder, setReorder] = useState('')
  const [name, setName] = useState('')
  const [unit, setUnit] = useState('pcs')
  const [error, setError] = useState<string | null>(null)
  const rows = [...(supplies.data ?? [])].sort((a, b) => Number(low(b)) - Number(low(a)) || a.name.localeCompare(b.name))
  const lowCount = rows.filter(low).length
  const shown = rows.filter((row) => view === 'all' || low(row))

  const openRow = (row: ClinicSupply) => {
    setOpen(row)
    setDirection('use')
    setCount('')
    setReorder(String(row.reorderLevel ?? 0))
    setError(null)
  }

  const saveStock = async () => {
    if (!open) return
    const n = Number(count || 0)
    const level = Number(reorder || 0)
    if (!Number.isFinite(n) || n < 0 || !Number.isFinite(level) || level < 0) return setError('Enter whole numbers, 0 or more.')
    const next = direction === 'use' ? open.quantityOnHand - n : open.quantityOnHand + n
    if (next < 0) return setError(`Only ${open.quantityOnHand} ${open.unit ?? ''} left.`)
    try {
      await save.mutateAsync({ id: open._id, input: { quantityOnHand: next, reorderLevel: level } })
      haptic.success()
      toast(`${open.name}: ${next} ${open.unit ?? ''} left`)
      setOpen(null)
    } catch (failure) {
      haptic.error()
      setError(failure instanceof ApiError ? failure.message : "It didn't save. Try again.")
    }
  }

  const addSupply = async () => {
    if (!name.trim()) return setError('Enter the supply, such as "Paracetamol 500 mg".')
    try {
      await save.mutateAsync({ input: { name: name.trim(), unit: unit.trim() || 'pcs', quantityOnHand: Number(count || 0), reorderLevel: Number(reorder || 0) } })
      haptic.success()
      toast(`${name.trim()} added`)
      setAdding(false)
    } catch (failure) {
      haptic.error()
      setError(failure instanceof ApiError ? failure.message : "It didn't save. Try again.")
    }
  }

  return (
    <MobileScreen
      refreshing={supplies.isRefetching}
      onRefresh={supplies.refetch}
      nav={<NavBar title="Clinic supplies" back={{ label: 'Clinic', onPress: router.back }} />}
      actionBar={
        canWrite ? (
          <ActionBar
            icon={PackagePlus}
            summary={lowCount ? `${lowCount} running low` : 'Stock is fine'}
            label="Add a supply"
            onPress={() => (setAdding(true), setName(''), setUnit('pcs'), setCount(''), setReorder(''), setError(null))}
          />
        ) : undefined
      }
      overlay={
        <>
          <BottomSheet
            open={Boolean(open)}
            onClose={() => setOpen(null)}
            title={open?.name ?? ''}
            description={open ? `${open.quantityOnHand} ${open.unit ?? ''} in stock${open.location ? ` · ${open.location}` : ''}` : undefined}
            footer={
              canWrite ? (
                <MobileButton fullWidth loading={save.isPending} onPress={saveStock}>
                  Save
                </MobileButton>
              ) : undefined
            }
          >
            {error ? (
              <Callout tone="danger" title="Not saved">
                {error}
              </Callout>
            ) : null}
            <View style={{ gap: space['space-4'] }}>
              <SegmentedControl
                label="Change"
                value={direction}
                onChange={setDirection}
                options={[
                  { value: 'use', label: 'Used' },
                  { value: 'add', label: 'Stock in' },
                ]}
              />
              <MobileTextField label={direction === 'use' ? 'How many were used' : 'How many came in'} type="number" value={count} onChangeText={(text) => setCount(text.replace(/[^0-9]/g, ''))} maxLength={6} />
              <MobileTextField label="Reorder when down to" type="number" value={reorder} onChangeText={(text) => setReorder(text.replace(/[^0-9]/g, ''))} maxLength={6} />
            </View>
          </BottomSheet>
          <BottomSheet
            open={adding}
            onClose={() => setAdding(false)}
            title="Add a supply"
            footer={
              <MobileButton fullWidth loading={save.isPending} onPress={addSupply}>
                Add supply
              </MobileButton>
            }
          >
            {error ? (
              <Callout tone="danger" title="Not saved">
                {error}
              </Callout>
            ) : null}
            <View style={{ gap: space['space-4'] }}>
              <MobileTextField label="Supply" value={name} onChangeText={setName} placeholder="Paracetamol 500 mg" maxLength={120} />
              <MobileTextField label="Counted in" value={unit} onChangeText={setUnit} placeholder="pcs, strips, bottles" maxLength={20} />
              <MobileTextField label="In stock now" type="number" value={count} onChangeText={(text) => setCount(text.replace(/[^0-9]/g, ''))} maxLength={6} />
              <MobileTextField label="Reorder when down to" type="number" value={reorder} onChangeText={(text) => setReorder(text.replace(/[^0-9]/g, ''))} maxLength={6} />
            </View>
          </BottomSheet>
        </>
      }
    >
      {rows.length ? (
        <ChipRail
          label="Show"
          value={view}
          onChange={setView}
          items={[
            { id: 'all', label: 'All', count: rows.length },
            { id: 'low', label: 'Running low', count: lowCount },
          ]}
        />
      ) : null}
      {supplies.isPending ? (
        <CardSkeleton rows={4} />
      ) : supplies.isError ? (
        <LoadFailed what="Supplies" error={supplies.error} onRetry={supplies.refetch} />
      ) : shown.length ? (
        <ListGroup
          footer="Tap a supply to note what was used or what came in."
          items={shown.map((row) => ({
            title: row.name,
            subtitle: [row.category, row.location, row.expiryDate ? `Expires ${row.expiryDate}` : null, `reorder at ${row.reorderLevel}`].filter(Boolean).join(' · '),
            value: `${row.quantityOnHand} ${row.unit ?? ''}`.trim(),
            badge: low(row) ? { label: 'Low', tone: 'warning' as const } : undefined,
            icon: Pill,
            tile: 5,
            lines: 2,
            onPress: () => openRow(row),
          }))}
        />
      ) : (
        <Surface padded={false}>
          <StatusView compact kind="empty" icon={Pill} title={view === 'low' ? 'Nothing running low' : 'No supplies yet'} body={view === 'low' ? 'Supplies at or below their reorder level show here.' : 'Add the clinic’s medicines and first-aid stock.'} />
        </Surface>
      )}
    </MobileScreen>
  )
}
