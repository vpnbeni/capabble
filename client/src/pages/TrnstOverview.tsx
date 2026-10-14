import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { ArrowRight, Bus, Footprints, MapPinned, Users } from 'lucide-react'
import trnstService, { type SelfStudentRecord, type TransportOverview, type TransportRoute, type TransportVehicle } from '@/services/trnstService'
import { Banner, Button, Card, DataTable, EmptyState, Page, StatCard, orDash, type DataTableColumn } from '@/components/ui'
import { Entity, PapersBadge, VehicleStatusBadge, errorMessage, papersDue, routeVehicle, vehicleName } from '@/components/trnst/TrnstUi'

const emptyStats: TransportOverview['stats'] = {
  vehicleCount: 0,
  routeCount: 0,
  activeVehicles: 0,
  maintenanceVehicles: 0,
  totalCapacity: 0,
  selfStudentCount: 0,
  totalStops: 0,
}

const TrnstOverview: React.FC = () => {
  const navigate = useNavigate()
  const [data, setData] = useState<TransportOverview | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      try {
        setData(await trnstService.getOverview())
      } catch (error) {
        toast.error(errorMessage(error, 'Could not load the transport overview.'))
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [])

  if (loading && !data) {
    return (
      <Page>
        <div className="cb-table-state" role="status">
          <span className="cb-spinner" aria-hidden="true" />
          Loading transport records
        </div>
      </Page>
    )
  }

  const stats = data?.stats || emptyStats
  const vehicles = data?.vehicles || []
  const routes = data?.routes || []
  const selfStudents = data?.selfStudents || []
  const withPapersDue = vehicles.filter((vehicle) => papersDue(vehicle).length > 0)
  const withoutDriver = vehicles.filter((vehicle) => vehicle.status === 'active' && !vehicle.driverName).length

  const vehicleColumns: DataTableColumn<TransportVehicle>[] = [
    {
      key: 'vehicle',
      header: 'Vehicle',
      mobile: 'title',
      render: (v) => <Entity primary={vehicleName(v)} secondary={`${v.registrationNumber} · ${v.capacity || 0} seats`} />,
    },
    { key: 'driver', header: 'Driver', mobile: 'subtitle', render: (v) => orDash(v.driverName) },
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
  ]

  const routeColumns: DataTableColumn<TransportRoute>[] = [
    {
      key: 'route',
      header: 'Route',
      mobile: 'title',
      render: (r) => <Entity primary={`${r.code} · ${r.name}`} secondary={`${r.startPoint || 'Start'} → ${r.endPoint || 'End'}`} />,
    },
    { key: 'vehicle', header: 'Vehicle', mobile: 'subtitle', render: (r) => vehicleName(routeVehicle(r)) || 'Unassigned' },
    { key: 'stops', header: 'Stops', numeric: true, mobile: 'aside', render: (r) => r.stops?.length || 0 },
  ]

  const selfColumns: DataTableColumn<SelfStudentRecord>[] = [
    {
      key: 'name',
      header: 'Student',
      mobile: 'title',
      render: (s) => <Entity primary={s.name} secondary={s.rollNumber ? `Roll ${s.rollNumber}` : undefined} />,
    },
    { key: 'class', header: 'Class', mobile: 'subtitle', render: (s) => orDash([s.className, s.section].filter(Boolean).join(' ')) },
    { key: 'mode', header: 'Comes by', mobile: 'aside', render: (s) => s.commuteMode },
    { key: 'phone', header: 'Guardian phone', mobile: 'hidden', render: (s) => orDash(s.guardianPhone) },
  ]

  return (
    <Page>
      {withPapersDue.length ? (
        <Banner tone={withPapersDue.some((v) => papersDue(v).some((p) => p.days < 0)) ? 'danger' : 'warning'} title="Vehicle papers need renewing">
          {withPapersDue.map(vehicleName).join(', ')} {withPapersDue.length === 1 ? 'has' : 'have'} insurance or fitness lapsed or lapsing within 30 days.
        </Banner>
      ) : null}

      <section className="cb-stats" aria-label="Transport totals">
        <StatCard
          label="Vehicles"
          value={stats.vehicleCount}
          icon={Bus}
          hint={stats.maintenanceVehicles ? `${stats.activeVehicles} running · ${stats.maintenanceVehicles} in maintenance` : `${stats.activeVehicles} running`}
        />
        <StatCard label="Routes" value={stats.routeCount} icon={MapPinned} hint={`${stats.totalStops} stops mapped`} />
        <StatCard
          label="Seat capacity"
          value={stats.totalCapacity}
          icon={Users}
          hint={withoutDriver ? `${withoutDriver} active vehicle${withoutDriver === 1 ? '' : 's'} without a driver` : 'Across the active fleet'}
        />
        <StatCard label="Self students" value={stats.selfStudentCount || 0} icon={Footprints} hint="Come without school transport" />
      </section>

      <div className="cb-grid-6-6">
        <Card
          flush
          className="tr-records"
          title="Vehicles"
          subtitle="Fleet status and assigned drivers."
          action={
            <Button variant="tertiary" size="sm" iconRight={ArrowRight} onClick={() => navigate('/trnst/vehicles')}>
              Manage vehicles
            </Button>
          }
        >
          <DataTable
            caption="Vehicles"
            columns={vehicleColumns}
            rows={vehicles.slice(0, 5)}
            getRowKey={(v) => v._id}
            onRowClick={() => navigate('/trnst/vehicles')}
            empty={<EmptyState compact icon={Bus} title="No vehicles yet" body="Add the first school bus or van." />}
          />
        </Card>
        <Card
          flush
          className="tr-records"
          title="Routes"
          subtitle="Pickup routes and the vehicle on each."
          action={
            <Button variant="tertiary" size="sm" iconRight={ArrowRight} onClick={() => navigate('/trnst/routes')}>
              Manage routes
            </Button>
          }
        >
          <DataTable
            caption="Routes"
            columns={routeColumns}
            rows={routes.slice(0, 5)}
            getRowKey={(r) => r._id}
            onRowClick={() => navigate('/trnst/routes')}
            empty={<EmptyState compact icon={MapPinned} title="No routes yet" body="Create a pickup route and attach a vehicle." />}
          />
        </Card>
      </div>

      <Card
        flush
        className="tr-records"
        title="Self students"
        subtitle="Students who walk, cycle or are dropped by family."
        action={
          <Button variant="tertiary" size="sm" iconRight={ArrowRight} onClick={() => navigate('/trnst/self-students')}>
            Manage self students
          </Button>
        }
      >
        <DataTable
          caption="Self students"
          columns={selfColumns}
          rows={selfStudents.slice(0, 6)}
          getRowKey={(s) => s._id}
          onRowClick={() => navigate('/trnst/self-students')}
          empty={<EmptyState compact icon={Footprints} title="No self students recorded" body="Record students who walk, cycle or are dropped by parents." />}
        />
      </Card>
    </Page>
  )
}

export default TrnstOverview
