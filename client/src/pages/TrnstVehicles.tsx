import React, { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { Bus, Pencil, Plus, Trash2 } from 'lucide-react'
import teacherService, { type Teacher } from '@/services/teacherService'
import trnstService, { type TransportVehicle, type VehicleStatus, type VehicleType } from '@/services/trnstService'
import { isConductor, isDriver } from '@/utils/staafStaff'
import {
  Banner,
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
  TextArea,
  TextField,
  formatDate,
  orDash,
  type DataTableColumn,
} from '@/components/ui'
import {
  Entity,
  PapersBadge,
  VEHICLE_STATUS,
  VEHICLE_TYPES,
  VehicleStatusBadge,
  errorMessage,
  papersDue,
  vehicleName,
} from '@/components/trnst/TrnstUi'

type VehicleForm = {
  busNo: string
  registrationNumber: string
  vehicleType: VehicleType
  make: string
  model: string
  color: string
  capacity: number
  driverId: string
  conductorId: string
  conductorName: string
  conductorPhone: string
  insuranceExpiry: string
  fitnessExpiry: string
  status: VehicleStatus
  notes: string
}

const emptyVehicle: VehicleForm = {
  busNo: '',
  registrationNumber: '',
  vehicleType: 'Bus',
  make: '',
  model: '',
  color: '',
  capacity: 40,
  driverId: '',
  conductorId: '',
  conductorName: '',
  conductorPhone: '',
  insuranceExpiry: '',
  fitnessExpiry: '',
  status: 'active',
  notes: '',
}

const toForm = (vehicle: TransportVehicle): VehicleForm => ({
  busNo: vehicle.busNo || '',
  registrationNumber: vehicle.registrationNumber || '',
  vehicleType: vehicle.vehicleType || 'Bus',
  make: vehicle.make || '',
  model: vehicle.model || '',
  color: vehicle.color || '',
  capacity: vehicle.capacity || 40,
  driverId: vehicle.driverId ? String(vehicle.driverId) : '',
  conductorId: vehicle.conductorId ? String(vehicle.conductorId) : '',
  conductorName: vehicle.conductorName || '',
  conductorPhone: vehicle.conductorPhone || '',
  insuranceExpiry: vehicle.insuranceExpiry ? String(vehicle.insuranceExpiry).slice(0, 10) : '',
  fitnessExpiry: vehicle.fitnessExpiry ? String(vehicle.fitnessExpiry).slice(0, 10) : '',
  status: vehicle.status || 'active',
  notes: vehicle.notes || '',
})

const TrnstVehicles: React.FC = () => {
  const [vehicles, setVehicles] = useState<TransportVehicle[]>([])
  const [drivers, setDrivers] = useState<Teacher[]>([])
  const [conductors, setConductors] = useState<Teacher[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<'all' | VehicleStatus>('all')
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editing, setEditing] = useState<TransportVehicle | null>(null)
  const [form, setForm] = useState<VehicleForm>(emptyVehicle)
  const [tried, setTried] = useState(false)
  const [saving, setSaving] = useState(false)
  const [removing, setRemoving] = useState<TransportVehicle | null>(null)
  const [deleting, setDeleting] = useState(false)

  const loadVehicles = async () => {
    try {
      setVehicles(await trnstService.getVehicles())
    } catch (error) {
      toast.error(errorMessage(error, 'Could not load vehicles.'))
    } finally {
      setLoading(false)
    }
  }

  const loadDrivers = async () => {
    try {
      const [driverList, conductorList] = await Promise.all([
        teacherService.getAll({ dutyType: 'Driver', isActive: true, limit: 200, sort: 'name' }),
        teacherService.getAll({ dutyType: 'Conductor', isActive: true, limit: 200, sort: 'name' }),
      ])
      setDrivers((driverList.items || []).filter(isDriver))
      setConductors((conductorList.items || []).filter(isConductor))
    } catch {
      setDrivers([])
      setConductors([])
    }
  }

  useEffect(() => {
    void loadVehicles()
    void loadDrivers()
  }, [])

  const assignedConductorIds = useMemo(() => {
    const map = new Map<string, string>()
    vehicles.forEach((vehicle) => {
      if (vehicle.conductorId && vehicle._id !== editing?._id) map.set(String(vehicle.conductorId), vehicleName(vehicle))
    })
    return map
  }, [vehicles, editing])

  // Which bus each driver already drives, so the picker can say so.
  const assignedDriverIds = useMemo(() => {
    const map = new Map<string, string>()
    vehicles.forEach((vehicle) => {
      if (vehicle.driverId && vehicle._id !== editing?._id) map.set(String(vehicle.driverId), vehicleName(vehicle))
    })
    return map
  }, [vehicles, editing])

  const counts = useMemo(
    () => ({
      active: vehicles.filter((v) => v.status === 'active').length,
      maintenance: vehicles.filter((v) => v.status === 'maintenance').length,
      inactive: vehicles.filter((v) => v.status === 'inactive').length,
    }),
    [vehicles]
  )
  const seats = vehicles.filter((v) => v.status === 'active').reduce((sum, v) => sum + (v.capacity || 0), 0)
  const papersDueCount = vehicles.filter((v) => papersDue(v).length > 0).length
  const noDriver = vehicles.filter((v) => !v.driverName).length

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return vehicles.filter((v) => {
      if (status !== 'all' && v.status !== status) return false
      if (!needle) return true
      return [v.busNo, v.registrationNumber, v.vehicleType, v.make, v.model, v.driverName]
        .some((value) => String(value || '').toLowerCase().includes(needle))
    })
  }, [vehicles, search, status])

  const set = (patch: Partial<VehicleForm>) => setForm((prev) => ({ ...prev, ...patch }))

  const openAdd = () => {
    setEditing(null)
    setForm(emptyVehicle)
    setTried(false)
    setSheetOpen(true)
  }

  const openEdit = (vehicle: TransportVehicle) => {
    setEditing(vehicle)
    setForm(toForm(vehicle))
    setTried(false)
    setSheetOpen(true)
  }

  const save = async () => {
    setTried(true)
    if (!form.busNo.trim() || !form.registrationNumber.trim()) {
      toast.error('Enter the bus number and registration number.')
      return
    }
    setSaving(true)
    try {
      await trnstService.saveVehicle(
        {
          ...form,
          driverId: form.driverId || null,
          conductorId: form.conductorId || null,
          insuranceExpiry: form.insuranceExpiry || null,
          fitnessExpiry: form.fitnessExpiry || null,
        },
        editing?._id
      )
      toast.success(editing ? 'Vehicle updated.' : 'Vehicle added.')
      setSheetOpen(false)
      await loadVehicles()
    } catch (error) {
      toast.error(errorMessage(error, 'Could not save the vehicle.'))
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!removing) return
    setDeleting(true)
    try {
      await trnstService.deleteVehicle(removing._id)
      toast.success('Vehicle removed.')
      setRemoving(null)
      await loadVehicles()
    } catch (error) {
      toast.error(errorMessage(error, 'Could not remove the vehicle.'))
    } finally {
      setDeleting(false)
    }
  }

  const columns: DataTableColumn<TransportVehicle>[] = [
    {
      key: 'vehicle',
      header: 'Vehicle',
      mobile: 'title',
      render: (v) => (
        <Entity primary={vehicleName(v)} secondary={[v.vehicleType, [v.make, v.model].filter(Boolean).join(' ')].filter(Boolean).join(' · ')} />
      ),
    },
    { key: 'registrationNumber', header: 'Registration', mobile: 'subtitle', render: (v) => orDash(v.registrationNumber) },
    { key: 'capacity', header: 'Seats', numeric: true, render: (v) => v.capacity || 0 },
    {
      key: 'driver',
      header: 'Driver',
      render: (v) => (v.driverName ? <Entity primary={v.driverName} secondary={v.driverPhone} /> : '—'),
    },
    { key: 'insurance', header: 'Insurance till', render: (v) => formatDate(v.insuranceExpiry) },
    { key: 'fitness', header: 'Fitness till', mobile: 'hidden', render: (v) => formatDate(v.fitnessExpiry) },
    {
      key: 'status',
      header: 'Status',
      mobile: 'aside',
      render: (v) => (
        <span className="tr-badges">
          <VehicleStatusBadge status={v.status} />
          <PapersBadge vehicle={v} />
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      headerLabel: 'Actions',
      align: 'right',
      width: 48,
      interactive: true,
      render: (v) => (
        <Menu
          label={`Actions for ${vehicleName(v)}`}
          items={[
            { label: 'Edit vehicle', icon: Pencil, onSelect: () => openEdit(v) },
            { divider: true },
            { label: 'Remove vehicle', icon: Trash2, tone: 'danger', onSelect: () => setRemoving(v) },
          ]}
        />
      ),
    },
  ]

  const filtered = Boolean(search.trim() || status !== 'all')

  return (
    <Page>
      <section className="cb-stats" aria-label="Fleet totals">
        <StatCard label="Vehicles" value={vehicles.length} icon={Bus} hint={`${counts.active} running`} />
        <StatCard label="Seats in service" value={seats} hint="Active vehicles only" />
        <StatCard label="Without a driver" value={noDriver} hint={drivers.length ? `${drivers.length} STAAF drivers on record` : 'No STAAF drivers yet'} />
        <StatCard label="Papers due" value={papersDueCount} hint="Insurance or fitness within 30 days" />
      </section>

      {!loading && drivers.length === 0 ? (
        <Banner tone="info" title="No drivers to assign">
          Add staff with the type Driver in STAAF and they will show up in the driver list here.
        </Banner>
      ) : null}

      <Card flush className="tr-records">
        <div className="tr-records__toolbar">
          <FilterBar
            search={{ placeholder: 'Search bus, number plate or driver', value: search, onChange: setSearch, label: 'Search vehicles' }}
            chips={[
              { id: 'all', label: 'All', count: vehicles.length, active: status === 'all' },
              { id: 'active', label: VEHICLE_STATUS.active.label, count: counts.active, active: status === 'active' },
              { id: 'maintenance', label: VEHICLE_STATUS.maintenance.label, count: counts.maintenance, active: status === 'maintenance' },
              { id: 'inactive', label: VEHICLE_STATUS.inactive.label, count: counts.inactive, active: status === 'inactive' },
            ]}
            onChipClick={(id) => setStatus(id as typeof status)}
            chipsLabel="Vehicle status"
            actions={
              <Button variant="primary" icon={Plus} onClick={openAdd}>
                Add vehicle
              </Button>
            }
          />
        </div>
        <DataTable
          caption="Vehicles"
          columns={columns}
          rows={rows}
          getRowKey={(v) => v._id}
          onRowClick={openEdit}
          loading={loading}
          loadingLabel="Loading vehicles…"
          empty={
            vehicles.length === 0 ? (
              <EmptyState
                icon={Bus}
                title="No vehicles yet"
                body="Add each bus or van with its number plate, seats and the STAAF driver who drives it."
                action={
                  <Button size="sm" icon={Plus} onClick={openAdd}>
                    Add vehicle
                  </Button>
                }
              />
            ) : (
              <EmptyState
                compact
                icon={Bus}
                title="No vehicles match these filters"
                body="Try another search or status."
                action={
                  filtered ? (
                    <Button
                      size="sm"
                      onClick={() => {
                        setSearch('')
                        setStatus('all')
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
        title={editing ? `Edit ${vehicleName(editing)}` : 'Add vehicle'}
        description="Number plate, seats, crew and paper renewal dates."
        icon={Bus}
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
              {editing ? 'Save vehicle' : 'Add vehicle'}
            </Button>
          </>
        }
      >
        <div className="cb-form-grid">
          <TextField
            label="Bus number"
            required
            autoFocus
            placeholder="e.g. 12"
            value={form.busNo}
            onChange={(e) => set({ busNo: e.target.value })}
            error={tried && !form.busNo.trim() ? 'Enter the bus number.' : undefined}
          />
          <TextField
            label="Registration number"
            required
            placeholder="e.g. HR12AB4518"
            value={form.registrationNumber}
            onChange={(e) => set({ registrationNumber: e.target.value })}
            error={tried && !form.registrationNumber.trim() ? 'Enter the number plate.' : undefined}
          />
          <Select
            label="Type"
            value={form.vehicleType}
            onChange={(e) => set({ vehicleType: e.target.value as VehicleType })}
            options={[...VEHICLE_TYPES]}
          />
          <TextField
            label="Seats"
            type="number"
            inputMode="numeric"
            min={1}
            value={form.capacity}
            onChange={(e) => set({ capacity: Number(e.target.value) || 1 })}
          />
          <TextField label="Make" placeholder="e.g. Tata" value={form.make} onChange={(e) => set({ make: e.target.value })} />
          <TextField label="Model" placeholder="e.g. Starbus" value={form.model} onChange={(e) => set({ model: e.target.value })} />
          <Select
            label="Status"
            value={form.status}
            onChange={(e) => set({ status: e.target.value as VehicleStatus })}
            options={Object.entries(VEHICLE_STATUS).map(([value, info]) => ({ value, label: info.label }))}
          />
          <TextField label="Colour" value={form.color} onChange={(e) => set({ color: e.target.value })} />
        </div>

        <div className="tr-section">
          <div className="tr-section__head">
            <span className="tr-section__title">Crew</span>
          </div>
          <div className="cb-form-grid">
            <Select
              className="is-wide"
              label="Driver"
              hint={drivers.length ? 'From STAAF staff with the type Driver.' : 'No STAAF drivers yet.'}
              value={form.driverId}
              onChange={(e) => set({ driverId: e.target.value })}
              placeholder="No driver"
              options={drivers.map((driver) => {
                const assignedTo = assignedDriverIds.get(String(driver._id))
                return { value: String(driver._id), label: assignedTo ? `${driver.name} (drives ${assignedTo})` : driver.name }
              })}
            />
            <Select
              className="is-wide"
              label="Conductor"
              hint={
                conductors.length
                  ? 'From STAAF staff with the type Conductor. The driver and conductor can sign in to run trips on this bus.'
                  : 'No STAAF conductors yet. Type a name below instead.'
              }
              value={form.conductorId}
              onChange={(e) => set({ conductorId: e.target.value })}
              placeholder="Not from STAAF"
              options={conductors.map((conductor) => {
                const assignedTo = assignedConductorIds.get(String(conductor._id))
                return { value: String(conductor._id), label: assignedTo ? `${conductor.name} (on ${assignedTo})` : conductor.name }
              })}
            />
            {!form.conductorId ? (
              <>
                <TextField label="Conductor name" value={form.conductorName} onChange={(e) => set({ conductorName: e.target.value })} />
                <TextField
                  label="Conductor phone"
                  type="tel"
                  inputMode="tel"
                  value={form.conductorPhone}
                  onChange={(e) => set({ conductorPhone: e.target.value })}
                />
              </>
            ) : null}
          </div>
        </div>

        <div className="tr-section">
          <div className="tr-section__head">
            <span className="tr-section__title">Papers</span>
            <span className="tr-section__hint">Flagged 30 days before they lapse.</span>
          </div>
          <div className="cb-form-grid">
            <TextField label="Insurance valid till" type="date" value={form.insuranceExpiry} onChange={(e) => set({ insuranceExpiry: e.target.value })} />
            <TextField label="Fitness valid till" type="date" value={form.fitnessExpiry} onChange={(e) => set({ fitnessExpiry: e.target.value })} />
            <TextArea className="is-wide" label="Notes" rows={3} value={form.notes} onChange={(e) => set({ notes: e.target.value })} />
          </div>
        </div>
      </Sheet>

      <Dialog
        open={Boolean(removing)}
        onClose={() => setRemoving(null)}
        tone="danger"
        size="sm"
        title={`Remove ${removing ? vehicleName(removing) : 'vehicle'}?`}
        description="It leaves the fleet list. Routes using it will show as unassigned."
        footer={
          <>
            <Button onClick={() => setRemoving(null)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="danger" loading={deleting} onClick={() => void remove()}>
              Remove vehicle
            </Button>
          </>
        }
      />
    </Page>
  )
}

export default TrnstVehicles
