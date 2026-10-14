import React, { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { MapPinned, Pencil, Plus, Trash2, X } from 'lucide-react'
import trnstService, { type RouteShift, type TransportRoute, type TransportStop, type TransportVehicle } from '@/services/trnstService'
import {
  Button,
  Card,
  DataTable,
  Dialog,
  EmptyState,
  FilterBar,
  Menu,
  Page,
  Select,
  Sheet,
  StatCard,
  TextField,
  type DataTableColumn,
} from '@/components/ui'
import { Entity, SHIFT_LABEL, errorMessage, routeVehicle, vehicleName } from '@/components/trnst/TrnstUi'

const emptyStop = (): TransportStop => ({ name: '', landmark: '', pickupTime: '', dropTime: '' })

type RouteForm = {
  name: string
  code: string
  vehicleId: string
  shift: RouteShift
  startPoint: string
  endPoint: string
  distanceKm: number
  stops: TransportStop[]
}

const emptyRoute = (): RouteForm => ({
  name: '',
  code: '',
  vehicleId: '',
  shift: 'both',
  startPoint: '',
  endPoint: '',
  distanceKm: 0,
  stops: [emptyStop()],
})

const vehicleIdOf = (value: TransportRoute['vehicleId']) => {
  if (!value) return ''
  if (typeof value === 'string') return value
  return value._id
}

const TrnstRoutes: React.FC = () => {
  const [routes, setRoutes] = useState<TransportRoute[]>([])
  const [vehicles, setVehicles] = useState<TransportVehicle[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [shift, setShift] = useState<'all' | RouteShift>('all')
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editing, setEditing] = useState<TransportRoute | null>(null)
  const [form, setForm] = useState<RouteForm>(emptyRoute)
  const [tried, setTried] = useState(false)
  const [saving, setSaving] = useState(false)
  const [removing, setRemoving] = useState<TransportRoute | null>(null)
  const [deleting, setDeleting] = useState(false)

  const loadData = async () => {
    try {
      const [nextRoutes, nextVehicles] = await Promise.all([trnstService.getRoutes(), trnstService.getVehicles()])
      setRoutes(nextRoutes)
      setVehicles(nextVehicles)
    } catch (error) {
      toast.error(errorMessage(error, 'Could not load routes.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadData()
  }, [])

  const totalStops = routes.reduce((sum, r) => sum + (r.stops?.length || 0), 0)
  const totalKm = routes.reduce((sum, r) => sum + (r.distanceKm || 0), 0)
  const unassigned = routes.filter((r) => !vehicleIdOf(r.vehicleId)).length

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return routes.filter((r) => {
      if (shift !== 'all' && r.shift !== shift) return false
      if (!needle) return true
      return [r.code, r.name, r.startPoint, r.endPoint, vehicleName(routeVehicle(r)), ...(r.stops || []).map((s) => s.name)]
        .some((value) => String(value || '').toLowerCase().includes(needle))
    })
  }, [routes, search, shift])

  const set = (patch: Partial<RouteForm>) => setForm((prev) => ({ ...prev, ...patch }))
  const updateStop = (index: number, patch: Partial<TransportStop>) =>
    setForm((prev) => ({ ...prev, stops: prev.stops.map((stop, i) => (i === index ? { ...stop, ...patch } : stop)) }))
  const removeStop = (index: number) =>
    setForm((prev) => ({ ...prev, stops: prev.stops.length > 1 ? prev.stops.filter((_, i) => i !== index) : [emptyStop()] }))

  const openAdd = () => {
    setEditing(null)
    setForm(emptyRoute())
    setTried(false)
    setSheetOpen(true)
  }

  const openEdit = (route: TransportRoute) => {
    setEditing(route)
    setForm({
      name: route.name || '',
      code: route.code || '',
      vehicleId: vehicleIdOf(route.vehicleId),
      shift: route.shift || 'both',
      startPoint: route.startPoint || '',
      endPoint: route.endPoint || '',
      distanceKm: route.distanceKm || 0,
      stops: route.stops?.length ? route.stops.map((stop) => ({ ...stop })) : [emptyStop()],
    })
    setTried(false)
    setSheetOpen(true)
  }

  const save = async () => {
    setTried(true)
    if (!form.name.trim() || !form.code.trim()) {
      toast.error('Enter the route name and code.')
      return
    }
    setSaving(true)
    try {
      await trnstService.saveRoute(
        { ...form, vehicleId: form.vehicleId || null, stops: form.stops.filter((stop) => stop.name.trim()) },
        editing?._id
      )
      toast.success(editing ? 'Route updated.' : 'Route added.')
      setSheetOpen(false)
      await loadData()
    } catch (error) {
      toast.error(errorMessage(error, 'Could not save the route.'))
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!removing) return
    setDeleting(true)
    try {
      await trnstService.deleteRoute(removing._id)
      toast.success('Route removed.')
      setRemoving(null)
      await loadData()
    } catch (error) {
      toast.error(errorMessage(error, 'Could not remove the route.'))
    } finally {
      setDeleting(false)
    }
  }

  const columns: DataTableColumn<TransportRoute>[] = [
    {
      key: 'route',
      header: 'Route',
      mobile: 'title',
      render: (r) => <Entity primary={`${r.code} · ${r.name}`} secondary={`${r.startPoint || 'Start'} → ${r.endPoint || 'End'}`} />,
    },
    { key: 'shift', header: 'Shift', mobile: 'subtitle', render: (r) => SHIFT_LABEL[r.shift] || r.shift },
    { key: 'vehicle', header: 'Vehicle', mobile: 'aside', render: (r) => vehicleName(routeVehicle(r)) || 'Unassigned' },
    {
      key: 'stops',
      header: 'Stops',
      render: (r) =>
        r.stops?.length ? (
          <Entity
            primary={`${r.stops.length} stop${r.stops.length === 1 ? '' : 's'}`}
            secondary={r.stops.map((s) => (s.pickupTime ? `${s.name} ${s.pickupTime}` : s.name)).join(' → ')}
          />
        ) : (
          '—'
        ),
    },
    { key: 'distance', header: 'Distance', numeric: true, mobile: 'hidden', render: (r) => (r.distanceKm ? `${r.distanceKm} km` : '—') },
    {
      key: 'actions',
      header: '',
      headerLabel: 'Actions',
      align: 'right',
      width: 48,
      interactive: true,
      render: (r) => (
        <Menu
          label={`Actions for ${r.code}`}
          items={[
            { label: 'Edit route', icon: Pencil, onSelect: () => openEdit(r) },
            { divider: true },
            { label: 'Remove route', icon: Trash2, tone: 'danger', onSelect: () => setRemoving(r) },
          ]}
        />
      ),
    },
  ]

  const shiftCount = (value: RouteShift) => routes.filter((r) => r.shift === value).length
  const filtered = Boolean(search.trim() || shift !== 'all')

  return (
    <Page>
      <section className="cb-stats" aria-label="Route totals">
        <StatCard label="Routes" value={routes.length} icon={MapPinned} />
        <StatCard label="Stops mapped" value={totalStops} />
        <StatCard label="Without a vehicle" value={unassigned} hint={unassigned ? 'Assign a bus or van' : 'Every route has a vehicle'} />
        <StatCard label="Distance covered" value={Math.round(totalKm * 10) / 10} unit="km" hint="One way, all routes" />
      </section>

      <Card flush className="tr-records">
        <div className="tr-records__toolbar">
          <FilterBar
            search={{ placeholder: 'Search route, stop or vehicle', value: search, onChange: setSearch, label: 'Search routes' }}
            chips={[
              { id: 'all', label: 'All', count: routes.length, active: shift === 'all' },
              { id: 'morning', label: 'Morning', count: shiftCount('morning'), active: shift === 'morning' },
              { id: 'afternoon', label: 'Afternoon', count: shiftCount('afternoon'), active: shift === 'afternoon' },
              { id: 'both', label: 'Both', count: shiftCount('both'), active: shift === 'both' },
            ]}
            onChipClick={(id) => setShift(id as typeof shift)}
            chipsLabel="Shift"
            actions={
              <Button variant="primary" icon={Plus} onClick={openAdd}>
                Add route
              </Button>
            }
          />
        </div>
        <DataTable
          caption="Routes"
          columns={columns}
          rows={rows}
          getRowKey={(r) => r._id}
          onRowClick={openEdit}
          loading={loading}
          loadingLabel="Loading routes…"
          empty={
            routes.length === 0 ? (
              <EmptyState
                icon={MapPinned}
                title="No routes yet"
                body="Add a pickup route with its stops and timings, then attach the vehicle that runs it."
                action={
                  <Button size="sm" icon={Plus} onClick={openAdd}>
                    Add route
                  </Button>
                }
              />
            ) : (
              <EmptyState
                compact
                icon={MapPinned}
                title="No routes match these filters"
                body="Try another search or shift."
                action={
                  filtered ? (
                    <Button
                      size="sm"
                      onClick={() => {
                        setSearch('')
                        setShift('all')
                      }}
                    >
                      Clear filters
                    </Button>
                  ) : undefined
                }
              />
            )
          }
        />
      </Card>

      <Sheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title={editing ? `Edit ${editing.code}` : 'Add route'}
        description="Where the route runs, the vehicle on it and each stop's timings."
        icon={MapPinned}
        size="lg"
        onSubmit={(event) => {
          event.preventDefault()
          if (!saving) void save()
        }}
        footer={
          <>
            <Button onClick={() => setSheetOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={saving}>
              {editing ? 'Save route' : 'Add route'}
            </Button>
          </>
        }
      >
        <div className="cb-form-grid">
          <TextField
            label="Route name"
            required
            autoFocus
            placeholder="e.g. Sector 14 loop"
            value={form.name}
            onChange={(e) => set({ name: e.target.value })}
            error={tried && !form.name.trim() ? 'Enter the route name.' : undefined}
          />
          <TextField
            label="Code"
            required
            placeholder="e.g. R1"
            value={form.code}
            onChange={(e) => set({ code: e.target.value })}
            error={tried && !form.code.trim() ? 'Enter a short code.' : undefined}
          />
          <Select
            label="Vehicle"
            value={form.vehicleId}
            onChange={(e) => set({ vehicleId: e.target.value })}
            placeholder="Unassigned"
            options={vehicles.map((v) => ({ value: v._id, label: `${vehicleName(v)} · ${v.registrationNumber} · ${v.capacity || 0} seats` }))}
          />
          <Select
            label="Shift"
            value={form.shift}
            onChange={(e) => set({ shift: e.target.value as RouteShift })}
            options={Object.entries(SHIFT_LABEL).map(([value, label]) => ({ value, label }))}
          />
          <TextField label="Start point" value={form.startPoint} onChange={(e) => set({ startPoint: e.target.value })} />
          <TextField label="End point" placeholder="Usually the school" value={form.endPoint} onChange={(e) => set({ endPoint: e.target.value })} />
          <TextField
            label="Distance"
            type="number"
            inputMode="decimal"
            min={0}
            suffix="km"
            value={form.distanceKm || ''}
            onChange={(e) => set({ distanceKm: Number(e.target.value) || 0 })}
          />
        </div>

        <div className="tr-section">
          <div className="tr-section__head">
            <span className="tr-section__title">Stops</span>
            <span className="tr-section__hint">In pickup order. Empty rows are skipped.</span>
          </div>
          <ol className="tr-stops">
            {form.stops.map((stop, index) => (
              <li key={index} className="tr-stop">
                <span className="tr-stop__num">{index + 1}</span>
                <TextField
                  className="tr-stop__name"
                  size="sm"
                  aria-label={`Stop ${index + 1} name`}
                  placeholder="Stop name"
                  value={stop.name}
                  onChange={(e) => updateStop(index, { name: e.target.value })}
                />
                <TextField
                  className="tr-stop__time"
                  size="sm"
                  placeholder="Pickup 07:10"
                  aria-label={`Stop ${index + 1} pickup time`}
                  value={stop.pickupTime || ''}
                  onChange={(e) => updateStop(index, { pickupTime: e.target.value })}
                />
                <TextField
                  className="tr-stop__time"
                  size="sm"
                  placeholder="Drop 14:20"
                  aria-label={`Stop ${index + 1} drop time`}
                  value={stop.dropTime || ''}
                  onChange={(e) => updateStop(index, { dropTime: e.target.value })}
                />
                <Button
                  className="tr-stop__remove"
                  variant="tertiary"
                  size="sm"
                  icon={X}
                  aria-label={`Remove stop ${index + 1}`}
                  onClick={() => removeStop(index)}
                />
              </li>
            ))}
          </ol>
          <div>
            <Button size="sm" icon={Plus} onClick={() => set({ stops: [...form.stops, emptyStop()] })}>
              Add stop
            </Button>
          </div>
        </div>
      </Sheet>

      <Dialog
        open={Boolean(removing)}
        onClose={() => setRemoving(null)}
        tone="danger"
        size="sm"
        title={`Remove route ${removing?.code || ''}?`}
        description="The route and its stops leave the list. The vehicle stays in the fleet."
        footer={
          <>
            <Button onClick={() => setRemoving(null)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="danger" loading={deleting} onClick={() => void remove()}>
              Remove route
            </Button>
          </>
        }
      />
    </Page>
  )
}

export default TrnstRoutes
