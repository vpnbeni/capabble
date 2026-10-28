import { useLocalSearchParams, useRouter } from 'expo-router'
import { ArrowRightLeft, CornerDownLeft, Package, UserRound, Wrench } from 'lucide-react-native'
import { useState } from 'react'
import { View } from 'react-native'

import { ApiError } from '@/lib/api'
import { formatDate, formatINR } from '@/lib/format'
import { CardSkeleton, LoadFailed } from '@/portal/states'
import { PRIORITIES, assetStatusLabel, assetTone, placeOf, type Priority } from '@/services/assetService'
import { useAllocateAsset, useAsset, useAssetLocations, useMoveAsset, useReportProblem, useReturnAsset } from '@/staff/assetQueries'
import { LocationChooser } from '@/staff/LocationChooser'
import { useStaff } from '@/staff/useStaff'
import { space } from '@/theme/tokens'
import { ActionSheet, Badge, BottomSheet, Callout, DetailList, ListGroup, MobileButton, MobileScreen, MobileTextField, NavBar, OptionList, Surface, Text, haptic, useToast } from '@/ui'

type Sheet = 'give' | 'move' | 'problem'

/**
 * One asset: what it is, where it is and who has it; give it to a room or person, move it, take it
 * back to the store, and report a problem. Its repairs are listed; their progress is updated under
 * Assets → Problems.
 */
export default function AssetScreen() {
  const router = useRouter()
  const toast = useToast()
  const staff = useStaff()
  const { id } = useLocalSearchParams<{ id: string }>()
  const record = useAsset(id)
  const locations = useAssetLocations()
  const allocate = useAllocateAsset()
  const move = useMoveAsset()
  const giveBack = useReturnAsset()
  const report = useReportProblem()
  // The kind stays while the sheet slides away, so its title doesn't change as it closes.
  const [sheet, setSheet] = useState<Sheet>('give')
  const [sheetOpen, setSheetOpen] = useState(false)
  const [choosingPlace, setChoosingPlace] = useState(false)
  const [placeId, setPlaceId] = useState('')
  const [person, setPerson] = useState('')
  const [reason, setReason] = useState('')
  const [issue, setIssue] = useState('')
  const [priority, setPriority] = useState<Priority>('Medium')
  const [confirmReturn, setConfirmReturn] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const data = record.data
  const asset = data?.asset
  const active = data?.allocations.find((row) => row.status === 'Active')
  const disposed = asset?.status === 'DISPOSED'
  const place = locations.data?.find((row) => row._id === placeId)
  const canAllocate = staff.can('asets.assets.allocate') && !disposed && asset?.status !== 'LOST' && asset?.status !== 'RETIRED'
  const canMove = staff.can('asets.assets.transfer') && !disposed
  const canReport = staff.can('asets.assets.maintain') && !disposed

  const start = (next: Sheet) => {
    setSheet(next)
    setSheetOpen(true)
    setChoosingPlace(false)
    setPlaceId('')
    setPerson('')
    setReason('')
    setIssue('')
    setPriority('Medium')
    setError(null)
  }

  const fail = (failure: unknown, fallback: string) => {
    haptic.error()
    setError(failure instanceof ApiError ? failure.message : fallback)
  }

  const submit = async () => {
    if (!asset) return
    try {
      if (sheet === 'problem') {
        if (!issue.trim()) return fail(null, 'Write what is wrong, such as "Fan makes a grinding noise".')
        await report.mutateAsync({ assetId: asset._id, issue: issue.trim(), priority })
        toast('Problem reported')
      } else {
        if (!placeId) return fail(null, 'Choose where it goes.')
        if (sheet === 'give') {
          await allocate.mutateAsync({ assetId: asset._id, toLocationId: placeId, newCustodianName: person.trim() || undefined, reason: reason.trim() || undefined, markInUse: true })
          toast(`Given to ${person.trim() || place?.name || 'the room'}`)
        } else {
          const moved = await move.mutateAsync({ assetId: asset._id, destinationLocationId: placeId, reason: reason.trim() || undefined })
          toast(moved.status === 'Pending' ? 'Move sent for approval' : `Moved to ${place?.name ?? 'the new place'}`)
        }
      }
      haptic.success()
      setSheetOpen(false)
    } catch (failure) {
      fail(failure, "It didn't save. Try again.")
    }
  }

  const doReturn = async () => {
    if (!active) return
    setConfirmReturn(false)
    try {
      await giveBack.mutateAsync(active._id)
      haptic.success()
      toast('Returned to the store')
    } catch (failure) {
      haptic.error()
      toast(failure instanceof ApiError ? failure.message : "It wasn't returned. Try again.", 'danger')
    }
  }

  const saving = allocate.isPending || move.isPending || report.isPending

  return (
    <MobileScreen
      refreshing={record.isRefetching}
      onRefresh={record.refetch}
      nav={<NavBar title="Asset" back={{ label: 'Assets', onPress: router.back }} />}
      overlay={
        <>
          <BottomSheet
            open={sheetOpen}
            onClose={() => (choosingPlace ? setChoosingPlace(false) : setSheetOpen(false))}
            detent="large"
            title={choosingPlace ? 'Place' : sheet === 'give' ? 'Give to someone' : sheet === 'move' ? 'Move to another place' : 'Report a problem'}
            description={choosingPlace ? undefined : asset?.name}
            footer={
              choosingPlace ? undefined : (
                <MobileButton fullWidth loading={saving} onPress={submit}>
                  {sheet === 'give' ? 'Give' : sheet === 'move' ? 'Move' : 'Report problem'}
                </MobileButton>
              )
            }
          >
            {choosingPlace ? (
              <LocationChooser value={placeId || null} exclude={sheet === 'move' ? asset?.locationId?._id : undefined} onChange={(value) => (setPlaceId(value), setChoosingPlace(false))} />
            ) : (
              <>
                {error ? (
                  <Callout tone="danger" title="Not saved">
                    {error}
                  </Callout>
                ) : null}
                {sheet === 'problem' ? (
                  <>
                    <MobileTextField label="What is wrong" value={issue} onChangeText={setIssue} placeholder="Fan makes a grinding noise" multiline maxLength={500} />
                    <OptionList label="How urgent" header="How urgent" value={priority} onChange={setPriority} options={PRIORITIES.map((value) => ({ value, label: value }))} />
                  </>
                ) : (
                  <View style={{ gap: space['space-4'] }}>
                    <ListGroup items={[{ title: 'Place', value: place?.name ?? 'Choose', onPress: () => setChoosingPlace(true) }]} />
                    {sheet === 'give' ? <MobileTextField label="Person (optional)" hint="Who looks after it there." value={person} onChangeText={setPerson} placeholder="Ms Sharma" maxLength={120} /> : null}
                    <MobileTextField label="Reason (optional)" value={reason} onChangeText={setReason} maxLength={200} />
                  </View>
                )}
              </>
            )}
          </BottomSheet>
          <ActionSheet
            open={confirmReturn}
            onClose={() => setConfirmReturn(false)}
            title="Take it back to the store?"
            message={active ? `It comes back from ${active.newCustodianName || active.toLocationId?.name || 'where it is'}.` : undefined}
            actions={[{ label: 'Return to store', onSelect: doReturn }]}
          />
        </>
      }
    >
      {record.isPending ? (
        <CardSkeleton rows={5} />
      ) : record.isError || !asset ? (
        <LoadFailed what="The asset" error={record.error} onRetry={record.refetch} />
      ) : (
        <>
          <View style={{ gap: space['space-1'], paddingTop: space['space-2'] }}>
            <Text variant="m-section" accessibilityRole="header">
              {asset.name}
            </Text>
            <Text variant="m-subhead" tone="muted">
              {[asset.assetId, asset.categoryId?.name].filter(Boolean).join(' · ')}
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space['space-2'], marginTop: space['space-1'] }}>
              <Badge label={assetStatusLabel(asset.status)} tone={assetTone(asset.status)} />
              <Badge label={asset.condition} tone={asset.condition === 'Damaged' || asset.condition === 'Beyond Repair' ? 'danger' : asset.condition === 'Poor' ? 'warning' : 'neutral'} />
            </View>
          </View>
          {canAllocate || canMove || canReport ? (
            <ListGroup
              items={[
                ...(canAllocate ? [{ title: 'Give to someone', icon: UserRound, tile: 2 as const, onPress: () => start('give') }] : []),
                ...(canMove ? [{ title: 'Move to another place', icon: ArrowRightLeft, tile: 3 as const, onPress: () => start('move') }] : []),
                ...(active && staff.can('asets.assets.allocate') ? [{ title: 'Return to the store', icon: CornerDownLeft, tile: 1 as const, onPress: () => setConfirmReturn(true) }] : []),
                ...(canReport ? [{ title: 'Report a problem', icon: Wrench, tile: 4 as const, onPress: () => start('problem') }] : []),
              ]}
            />
          ) : null}
          <Surface>
            <DetailList
              columns={2}
              items={[
                { label: 'Where', value: placeOf(asset) || 'Not given a place', wide: true },
                { label: 'With', value: asset.custodianName || null },
                { label: 'Department', value: asset.department || null },
                { label: 'Brand and model', value: [asset.brand, asset.model].filter(Boolean).join(' ') || null, wide: true },
                { label: 'Serial number', value: asset.serialNumber || null },
                { label: 'Tag', value: asset.assetTag && asset.assetTag !== asset.assetId ? asset.assetTag : null },
                { label: 'Bought', value: asset.purchaseDate ? formatDate(asset.purchaseDate) : null },
                { label: 'Cost', value: asset.purchaseCost ? formatINR(asset.purchaseCost) : null },
                { label: 'Warranty until', value: asset.warranty?.endDate ? formatDate(asset.warranty.endDate) : null },
                { label: 'Next service', value: asset.nextMaintenanceDue ? formatDate(asset.nextMaintenanceDue) : null },
                ...(asset.notes ? [{ label: 'Notes', value: asset.notes, wide: true }] : []),
              ].filter((row) => row.value)}
            />
          </Surface>
          {data.maintenance.length ? (
            <ListGroup
              header="Repairs"
              footer="Update a repair's progress under Assets → Problems."
              items={data.maintenance.map((row) => ({
                title: row.issue,
                subtitle: [formatDate(row.reportedDate), row.assignedTo, row.cost ? formatINR(row.cost) : null].filter(Boolean).join(' · '),
                badge: { label: row.status, tone: assetTone(row.status) },
                icon: Wrench,
                tile: 4,
                lines: 2,
              }))}
            />
          ) : null}
          {data.allocations.length ? (
            <ListGroup
              header="Given to"
              items={data.allocations.slice(0, 10).map((row) => ({
                title: row.newCustodianName || row.toLocationId?.name || 'A room',
                subtitle: [row.newCustodianName ? row.toLocationId?.name : null, formatDate(row.allocationDate)].filter(Boolean).join(' · '),
                badge: row.status === 'Active' ? { label: 'Now', tone: 'success' as const } : undefined,
                icon: Package,
                tile: 2,
              }))}
            />
          ) : null}
        </>
      )}
    </MobileScreen>
  )
}
