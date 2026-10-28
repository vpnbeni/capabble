import { useRouter } from 'expo-router'
import { Boxes, Package, Search, Trash2, Wrench } from 'lucide-react-native'
import { useState } from 'react'
import { View } from 'react-native'

import { ApiError } from '@/lib/api'
import { formatDate, formatINR } from '@/lib/format'
import { CardSkeleton, LoadFailed } from '@/portal/states'
import { MAINTENANCE_STATUSES, assetStatusLabel, assetTone, placeOf, type Disposal, type Maintenance, type MaintenanceStatus, type StockItem } from '@/services/assetService'
import { useAdjustStock, useApproveDisposal, useAssetLocations, useAssetStock, useAssetSummary, useAssets, useDisposals, useMaintenance, useUpdateMaintenance } from '@/staff/assetQueries'
import { LocationChooser } from '@/staff/LocationChooser'
import { useStaff } from '@/staff/useStaff'
import { space } from '@/theme/tokens'
import { BottomSheet, Callout, ChipRail, Dialog, Hero, ListGroup, MobileButton, MobileScreen, MobileTextField, NavBar, OptionList, SearchBar, SegmentedControl, StatusView, Surface, haptic, useToast } from '@/ui'

type Show = 'assets' | 'problems' | 'stock' | 'disposals'

const openProblem = (row: Maintenance) => row.status !== 'Completed' && row.status !== 'Closed'
const lowStock = (row: StockItem) => row.quantityOnHand <= row.reorderLevel
const assetName = (row: Maintenance | Disposal) => (row.assetId && typeof row.assetId === 'object' ? row.assetId.name : 'Asset')
const assetCode = (row: Maintenance | Disposal) => (row.assetId && typeof row.assetId === 'object' ? row.assetId.assetId : null)

/**
 * The school's things: find an asset by name or ID, or by the room it is in; problems reported
 * and their progress; consumable stock in and out; disposals waiting for approval. Adding assets,
 * purchases and audits stay on the website.
 */
export default function AssetsScreen() {
  const router = useRouter()
  const toast = useToast()
  const staff = useStaff()
  const [show, setShow] = useState<Show>('assets')
  const [query, setQuery] = useState('')
  const [locationId, setLocationId] = useState('')
  const [picking, setPicking] = useState(false)
  const summary = useAssetSummary()
  const assets = useAssets({ q: query.trim(), locationId }, show === 'assets')
  const locations = useAssetLocations(Boolean(locationId))
  const problems = useMaintenance()
  const stock = useAssetStock(show === 'stock')
  const disposals = useDisposals(staff.can('asets.assets.dispose'))
  const updateProblem = useUpdateMaintenance()
  const adjust = useAdjustStock()
  const approve = useApproveDisposal()

  const [problem, setProblem] = useState<Maintenance | null>(null)
  const [nextStatus, setNextStatus] = useState<MaintenanceStatus>('Reported')
  const [assignedTo, setAssignedTo] = useState('')
  const [item, setItem] = useState<StockItem | null>(null)
  const [direction, setDirection] = useState<'issue' | 'receipt'>('issue')
  const [count, setCount] = useState('')
  const [approving, setApproving] = useState<Disposal | null>(null)
  const [error, setError] = useState<string | null>(null)

  const place = locations.data?.find((row) => row._id === locationId)
  const open = (problems.data ?? []).filter(openProblem)
  const pending = (disposals.data ?? []).filter((row) => row.status === 'Pending')
  const kpis = summary.data?.kpis

  const message = (failure: unknown, fallback: string) => {
    haptic.error()
    return failure instanceof ApiError ? failure.message : fallback
  }

  const startProblem = (row: Maintenance) => {
    setProblem(row)
    setNextStatus(row.status)
    setAssignedTo(row.assignedTo ?? '')
    setError(null)
  }

  const saveProblem = async () => {
    if (!problem) return
    // Only what changed goes back.
    const input = { ...(nextStatus !== problem.status ? { status: nextStatus } : {}), ...(assignedTo.trim() !== (problem.assignedTo ?? '') ? { assignedTo: assignedTo.trim() } : {}) }
    if (!Object.keys(input).length) return setProblem(null)
    try {
      await updateProblem.mutateAsync({ id: problem._id, input })
      haptic.success()
      toast(nextStatus === 'Completed' || nextStatus === 'Closed' ? 'Problem marked fixed' : 'Problem updated')
      setProblem(null)
    } catch (failure) {
      setError(message(failure, "It didn't save. Try again."))
    }
  }

  const saveStock = async () => {
    if (!item) return
    const n = Number(count)
    if (!Number.isInteger(n) || n <= 0) return setError('Enter how many, 1 or more.')
    if (direction === 'issue' && n > item.quantityOnHand) return setError(`Only ${item.quantityOnHand} ${item.unit ?? ''} left.`)
    try {
      const result = await adjust.mutateAsync({ id: item._id, input: { type: direction, quantity: n } })
      haptic.success()
      toast(`${item.name}: ${result.item.quantityOnHand} ${item.unit ?? ''} left`)
      setItem(null)
    } catch (failure) {
      setError(message(failure, "It didn't save. Try again."))
    }
  }

  const doApprove = async () => {
    if (!approving) return
    try {
      await approve.mutateAsync(approving._id)
      haptic.medium()
      toast('Disposal approved')
      setApproving(null)
    } catch (failure) {
      toast(message(failure, "It wasn't approved. Try again."), 'danger')
    }
  }

  return (
    <MobileScreen
      refreshing={summary.isRefetching || assets.isRefetching || problems.isRefetching}
      onRefresh={() => (summary.refetch(), assets.refetch(), problems.refetch(), stock.refetch(), disposals.refetch())}
      nav={<NavBar title="Assets" back={{ label: 'Back', onPress: router.back }} />}
      overlay={
        <>
          <BottomSheet open={picking} onClose={() => setPicking(false)} detent="large" title="Place">
            <LocationChooser value={locationId} anyLabel="Everywhere" onChange={(value) => (setLocationId(value), setPicking(false))} />
          </BottomSheet>
          <BottomSheet
            open={Boolean(problem)}
            onClose={() => setProblem(null)}
            detent="large"
            title={problem ? assetName(problem) : ''}
            description={problem ? `${problem.issue} · reported ${formatDate(problem.reportedDate)}` : undefined}
            footer={
              staff.can('asets.assets.maintain') ? (
                <MobileButton fullWidth loading={updateProblem.isPending} onPress={saveProblem}>
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
            <MobileTextField label="Who is fixing it (optional)" value={assignedTo} onChangeText={setAssignedTo} placeholder="Electrician, vendor or staff" maxLength={120} />
            <OptionList label="Status" header="Status" value={nextStatus} onChange={setNextStatus} options={MAINTENANCE_STATUSES.map((value) => ({ value, label: value }))} />
          </BottomSheet>
          <BottomSheet
            open={Boolean(item)}
            onClose={() => setItem(null)}
            title={item?.name ?? ''}
            description={item ? `${item.quantityOnHand} ${item.unit ?? ''} in stock · reorder at ${item.reorderLevel}` : undefined}
            footer={
              <MobileButton fullWidth loading={adjust.isPending} onPress={saveStock}>
                Save
              </MobileButton>
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
                  { value: 'issue', label: 'Given out' },
                  { value: 'receipt', label: 'Stock in' },
                ]}
              />
              <MobileTextField label={direction === 'issue' ? 'How many were given out' : 'How many came in'} type="number" value={count} onChangeText={(text) => setCount(text.replace(/[^0-9]/g, ''))} maxLength={6} />
            </View>
          </BottomSheet>
          <Dialog
            open={Boolean(approving)}
            onClose={() => setApproving(null)}
            tone="danger"
            title="Approve this disposal?"
            description={approving ? `${assetName(approving)} leaves the register: ${approving.reason.toLowerCase()}${approving.method ? `, ${approving.method.toLowerCase()}` : ''}.` : undefined}
            footer={
              <>
                <MobileButton variant="gray" onPress={() => setApproving(null)}>
                  Not now
                </MobileButton>
                <MobileButton variant="destructive" loading={approve.isPending} onPress={doApprove}>
                  Approve
                </MobileButton>
              </>
            }
          />
        </>
      }
    >
      <Hero
        tone={kpis?.underMaintenance || kpis?.damaged || kpis?.lost ? 'soft' : 'surface'}
        icon={Boxes}
        label="In the register"
        value={String(kpis?.totalAssets ?? 0)}
        detail={kpis ? `${kpis.inUse} in use · ${kpis.inStock} in stock · ${kpis.underMaintenance} being fixed${kpis.lost ? ` · ${kpis.lost} lost` : ''}` : ' '}
      />
      <ChipRail
        label="Show"
        value={show}
        onChange={(next) => (setShow(next), setError(null))}
        items={[
          { id: 'assets', label: 'Assets' },
          { id: 'problems', label: 'Problems', count: open.length },
          { id: 'stock', label: 'Stock' },
          ...(staff.can('asets.assets.dispose') ? [{ id: 'disposals' as const, label: 'Disposals', count: pending.length }] : []),
        ]}
      />
      {show === 'assets' ? (
        <>
          <SearchBar label="Search assets" placeholder="Name, asset ID or serial" value={query} onChange={setQuery} onCancel={() => setQuery('')} />
          <ListGroup items={[{ title: 'Place', value: locationId ? (place?.name ?? 'Chosen') : 'Everywhere', onPress: () => setPicking(true) }]} />
          {assets.isPending ? (
            <CardSkeleton rows={4} />
          ) : assets.isError ? (
            <LoadFailed what="Assets" error={assets.error} onRetry={assets.refetch} />
          ) : assets.data?.items.length ? (
            <ListGroup
              header={`${assets.data.total} ${assets.data.total === 1 ? 'asset' : 'assets'}`}
              footer={assets.data.total > assets.data.items.length ? `Showing ${assets.data.items.length}. Search to find the rest.` : undefined}
              items={assets.data.items.map((asset) => ({
                title: asset.name,
                subtitle: [asset.assetId, placeOf(asset), asset.custodianName].filter(Boolean).join(' · '),
                badge: { label: assetStatusLabel(asset.status), tone: assetTone(asset.status) },
                icon: Package,
                tile: 2,
                lines: 2,
                onPress: () => router.push({ pathname: '/asset-register/[id]', params: { id: asset._id } }),
              }))}
            />
          ) : (
            <Surface padded={false}>
              <StatusView compact kind="empty" icon={Search} title={query.trim() || locationId ? 'No asset found' : 'No assets yet'} body={query.trim() || locationId ? 'Try the asset ID on its label, or another place.' : 'Assets are added to the register on the website.'} />
            </Surface>
          )}
        </>
      ) : show === 'problems' ? (
        problems.isPending ? (
          <CardSkeleton rows={4} />
        ) : problems.isError ? (
          <LoadFailed what="Problems" error={problems.error} onRetry={problems.refetch} />
        ) : open.length ? (
          <ListGroup
            header={`${open.length} open`}
            footer="Report a problem from the asset's page."
            items={open.map((row) => ({
              title: assetName(row),
              subtitle: [row.issue, assetCode(row), row.assignedTo, `reported ${formatDate(row.reportedDate)}`].filter(Boolean).join(' · '),
              badge: { label: row.status, tone: assetTone(row.status) },
              icon: Wrench,
              tile: 4,
              lines: 2,
              onPress: () => startProblem(row),
            }))}
          />
        ) : (
          <Surface padded={false}>
            <StatusView compact kind="empty" icon={Wrench} title="Nothing to fix" body="Problems reported on an asset show here until they are fixed." />
          </Surface>
        )
      ) : show === 'stock' ? (
        stock.isPending ? (
          <CardSkeleton rows={4} />
        ) : stock.isError ? (
          <LoadFailed what="Stock" error={stock.error} onRetry={stock.refetch} />
        ) : stock.data?.length ? (
          <ListGroup
            header={`${stock.data.length} ${stock.data.length === 1 ? "item" : "items"} · ${stock.data.filter(lowStock).length} running low`}
            footer={staff.can('asets.assets.edit') ? 'Tap an item to note what was given out or what came in.' : undefined}
            items={[...stock.data]
              .sort((a, b) => Number(lowStock(b)) - Number(lowStock(a)) || a.name.localeCompare(b.name))
              .map((row) => ({
                title: row.name,
                subtitle: [row.sku, row.locationId?.name, `reorder at ${row.reorderLevel}`].filter(Boolean).join(' · '),
                value: `${row.quantityOnHand} ${row.unit ?? ''}`.trim(),
                badge: lowStock(row) ? { label: 'Low', tone: 'warning' as const } : undefined,
                lines: 2,
                onPress: staff.can('asets.assets.edit') ? () => (setItem(row), setDirection('issue'), setCount(''), setError(null)) : undefined,
              }))}
          />
        ) : (
          <Surface padded={false}>
            <StatusView compact kind="empty" icon={Package} title="No stock items" body="Consumables such as chalk and paper are set up on the website." />
          </Surface>
        )
      ) : disposals.isPending ? (
        <CardSkeleton rows={3} />
      ) : disposals.isError ? (
        <LoadFailed what="Disposals" error={disposals.error} onRetry={disposals.refetch} />
      ) : disposals.data?.length ? (
        <ListGroup
          header={pending.length ? `${pending.length} waiting for approval` : 'Disposals'}
          items={disposals.data.map((row) => ({
            title: assetName(row),
            subtitle: [assetCode(row), row.reason, row.method, formatDate(row.disposalDate), row.residualValue ? formatINR(row.residualValue) : null].filter(Boolean).join(' · '),
            badge: { label: row.status, tone: assetTone(row.status) },
            icon: Trash2,
            tile: 5,
            lines: 2,
            onPress: row.status === 'Pending' ? () => setApproving(row) : undefined,
          }))}
        />
      ) : (
        <Surface padded={false}>
          <StatusView compact kind="empty" icon={Trash2} title="No disposals" body="Assets put up for disposal wait here for approval." />
        </Surface>
      )}
    </MobileScreen>
  )
}
