import React, { useCallback, useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { MapPinned, Route as RouteIcon, UserMinus } from 'lucide-react'
import trnstService, {
  type AssignmentRow,
  type AssignmentShift,
  type TransportRoute,
} from '@/services/trnstService'
import {
  Badge,
  BulkBar,
  Button,
  Card,
  DataTable,
  Dialog,
  EmptyState,
  FilterBar,
  Menu,
  Page,
  RadioGroup,
  Select,
  Sheet,
  useRowSelection,
  type DataTableColumn,
} from '@/components/ui'
import { Entity, errorMessage } from '@/components/trnst/TrnstUi'

type Status = 'all' | 'assigned' | 'unassigned'

const SHIFT_OPTIONS: Array<{ value: AssignmentShift; label: string }> = [
  { value: 'both', label: 'Pickup and drop' },
  { value: 'pickup', label: 'Pickup only' },
  { value: 'drop', label: 'Drop only' },
]
const SHIFT_LABEL = Object.fromEntries(SHIFT_OPTIONS.map((option) => [option.value, option.label])) as Record<AssignmentShift, string>

const TrnstAssignments: React.FC = () => {
  const [rows, setRows] = useState<AssignmentRow[]>([])
  const [classOptions, setClassOptions] = useState<Array<{ className: string; sections: string[] }>>([])
  const [routes, setRoutes] = useState<TransportRoute[]>([])
  const [loading, setLoading] = useState(true)
  const [className, setClassName] = useState('')
  const [section, setSection] = useState('')
  const [routeFilter, setRouteFilter] = useState('')
  const [status, setStatus] = useState<Status>('all')
  const [search, setSearch] = useState('')
  const [sheetOpen, setSheetOpen] = useState(false)
  const [form, setForm] = useState<{ routeId: string; stopId: string; shift: AssignmentShift }>({ routeId: '', stopId: '', shift: 'both' })
  const [saving, setSaving] = useState(false)
  const [removing, setRemoving] = useState<AssignmentRow | null>(null)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    try {
      const data = await trnstService.getAssignments({ className: className || undefined, section: section || undefined })
      setRows(data.rows)
      setClassOptions(data.classOptions)
    } catch (error) {
      toast.error(errorMessage(error, 'Could not load students.'))
    } finally {
      setLoading(false)
    }
  }, [className, section])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    trnstService.getRoutes().then(setRoutes).catch(() => setRoutes([]))
  }, [])

  const routeById = useMemo(() => new Map(routes.map((route) => [route._id, route])), [routes])
  const sections = classOptions.find((option) => option.className === className)?.sections || []

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return rows.filter((row) => {
      if (status === 'assigned' && !row.assignment) return false
      if (status === 'unassigned' && row.assignment) return false
      if (routeFilter && row.assignment?.routeId !== routeFilter) return false
      if (!needle) return true
      return [row.name, row.rollNumber, row.assignment?.stopName].some((value) => String(value || '').toLowerCase().includes(needle))
    })
  }, [rows, status, routeFilter, search])

  const bulk = useRowSelection(visible, (row) => row.studentId, { resetKey: `${className}-${section}`, rowLabel: (row) => `Select ${row.name}` })
  const selectedRoute = routeById.get(form.routeId)

  const openAssign = () => {
    const first = bulk.selectedRows.find((row) => row.assignment)?.assignment
    setForm({ routeId: first?.routeId || '', stopId: first?.stopId || '', shift: first?.shift || 'both' })
    setSheetOpen(true)
  }

  const assign = async () => {
    if (!form.routeId) {
      toast.error('Choose a route.')
      return
    }
    setSaving(true)
    try {
      const result = await trnstService.assignStudents({
        studentIds: bulk.selectedIds,
        routeId: form.routeId,
        stopId: form.stopId || undefined,
        shift: form.shift,
      })
      toast.success(result.message)
      setSheetOpen(false)
      bulk.clear()
      await load()
    } catch (error) {
      toast.error(errorMessage(error, 'Could not assign the students.'))
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!removing) return
    setDeleting(true)
    try {
      await trnstService.removeAssignment(removing.studentId)
      toast.success(`${removing.name} is off school transport.`)
      setRemoving(null)
      await load()
    } catch (error) {
      toast.error(errorMessage(error, 'Could not remove the student from the route.'))
    } finally {
      setDeleting(false)
    }
  }

  const columns: DataTableColumn<AssignmentRow>[] = [
    {
      key: 'student',
      header: 'Student',
      mobile: 'title',
      render: (row) => <Entity primary={row.name} secondary={`Class ${row.className}-${row.section} · ${row.rollNumber}`} />,
    },
    {
      key: 'route',
      header: 'Route',
      mobile: 'subtitle',
      render: (row) => {
        if (!row.assignment) return row.selfCommute ? `Comes on their own (${row.selfCommute.toLowerCase()})` : '—'
        const route = routeById.get(row.assignment.routeId)
        return <Entity primary={route ? `${route.code} · ${route.name}` : 'Route removed'} secondary={row.assignment.stopName || 'No stop set'} />
      },
    },
    { key: 'shift', header: 'Uses', mobile: 'hidden', render: (row) => (row.assignment ? SHIFT_LABEL[row.assignment.shift] : '—') },
    {
      key: 'status',
      header: 'Status',
      mobile: 'aside',
      render: (row) =>
        row.assignment ? (
          row.assignment.stopId ? <Badge tone="success">Assigned</Badge> : <Badge tone="warning">No stop</Badge>
        ) : (
          <Badge tone="neutral">Not on a route</Badge>
        ),
    },
    {
      key: 'actions',
      header: '',
      headerLabel: 'Actions',
      align: 'right',
      width: 48,
      interactive: true,
      render: (row) =>
        row.assignment ? (
          <Menu
            label={`Actions for ${row.name}`}
            items={[{ label: 'Take off school transport', icon: UserMinus, tone: 'danger', onSelect: () => setRemoving(row) }]}
          />
        ) : null,
    },
  ]

  const assignedCount = rows.filter((row) => row.assignment).length

  return (
    <Page>
      <Card flush className="tr-records">
        <div className="tr-records__toolbar">
          <FilterBar
            search={{ placeholder: 'Search student or stop', value: search, onChange: setSearch, label: 'Search students' }}
            chips={[
              { id: 'all', label: 'All', count: rows.length, active: status === 'all' },
              { id: 'assigned', label: 'On a route', count: assignedCount, active: status === 'assigned' },
              { id: 'unassigned', label: 'Not on a route', count: rows.length - assignedCount, active: status === 'unassigned' },
            ]}
            onChipClick={(id) => setStatus(id as Status)}
            chipsLabel="Status"
            filters={
              <>
                <Select
                  size="sm"
                  aria-label="Class"
                  value={className}
                  onChange={(event) => {
                    setClassName(event.target.value)
                    setSection('')
                  }}
                  placeholder="All classes"
                  options={classOptions.map((option) => ({ value: option.className, label: `Class ${option.className}` }))}
                />
                <Select
                  size="sm"
                  aria-label="Section"
                  value={section}
                  disabled={!className}
                  onChange={(event) => setSection(event.target.value)}
                  placeholder="All sections"
                  options={sections}
                />
                <Select
                  size="sm"
                  aria-label="Route"
                  value={routeFilter}
                  onChange={(event) => setRouteFilter(event.target.value)}
                  placeholder="All routes"
                  options={routes.map((route) => ({ value: route._id, label: `${route.code} · ${route.name}` }))}
                />
              </>
            }
          />
        </div>
        {bulk.count ? (
          <BulkBar count={bulk.count} noun="student" onClear={bulk.clear}>
            <Button size="sm" variant="primary" icon={RouteIcon} onClick={openAssign}>
              Assign to a route
            </Button>
          </BulkBar>
        ) : null}
        <DataTable
          caption="Students and their route"
          columns={columns}
          rows={visible}
          getRowKey={(row) => row.studentId}
          selection={bulk.selection}
          loading={loading}
          loadingLabel="Loading students…"
          empty={
            <EmptyState
              icon={MapPinned}
              title={rows.length ? 'No students match these filters' : 'No students in this class'}
              body={rows.length ? 'Try another class, route or search.' : 'Add students first, then assign them to a route here.'}
            />
          }
        />
      </Card>

      <Sheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title={`Assign ${bulk.count} student${bulk.count === 1 ? '' : 's'} to a route`}
        description="The bus crew sees them on their list, and parents see the bus on the map."
        icon={RouteIcon}
        onSubmit={(event) => {
          event.preventDefault()
          if (!saving) void assign()
        }}
        footer={
          <>
            <Button onClick={() => setSheetOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={saving}>
              Assign to route
            </Button>
          </>
        }
      >
        <div className="cb-stack">
          <Select
            label="Route"
            required
            value={form.routeId}
            onChange={(event) => setForm((prev) => ({ ...prev, routeId: event.target.value, stopId: '' }))}
            placeholder="Choose a route"
            options={routes.map((route) => ({ value: route._id, label: `${route.code} · ${route.name}` }))}
          />
          <Select
            label="Stop"
            hint={selectedRoute && !selectedRoute.stops?.length ? 'This route has no stops yet. Add them on the Routes page.' : 'Where the student gets on and off.'}
            value={form.stopId}
            disabled={!selectedRoute?.stops?.length}
            onChange={(event) => setForm((prev) => ({ ...prev, stopId: event.target.value }))}
            placeholder="No stop"
            options={(selectedRoute?.stops || [])
              .filter((stop) => stop._id)
              .map((stop, index) => ({ value: stop._id as string, label: `${index + 1}. ${stop.name}${stop.pickupTime ? ` · ${stop.pickupTime}` : ''}` }))}
          />
          <RadioGroup
            label="Uses the bus for"
            value={form.shift}
            onChange={(value) => setForm((prev) => ({ ...prev, shift: value as AssignmentShift }))}
            options={SHIFT_OPTIONS}
          />
        </div>
      </Sheet>

      <Dialog
        open={Boolean(removing)}
        onClose={() => setRemoving(null)}
        tone="danger"
        size="sm"
        title={`Take ${removing?.name || ''} off school transport?`}
        description="They leave the bus crew's list and their parents stop seeing the bus."
        footer={
          <>
            <Button onClick={() => setRemoving(null)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="danger" loading={deleting} onClick={() => void remove()}>
              Take off transport
            </Button>
          </>
        }
      />
    </Page>
  )
}

export default TrnstAssignments
