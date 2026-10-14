import React, { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { Armchair, LayoutGrid, Save } from 'lucide-react'
import type { Room } from '../../services/seatingPlanService'
import { seatingPlanService } from '../../services/seatingPlanService'
import {
  BENCH_TYPE_OPTIONS,
  calculateLayoutCapacity,
  calculateRowSeats,
  getRoomSeatingLayout,
  getSeatsPerBench,
  normalizeSeatingLayout,
  type RoomSeatingLayout,
  type SeatingLayoutRow,
} from '../../constants/examRoomLayout'
import {
  Badge,
  Banner,
  Button,
  Card,
  CardToolbar,
  DataTable,
  EmptyState,
  Menu,
  MetricTile,
  MetricTiles,
  Select,
  Sheet,
  TextField,
  type DataTableColumn,
} from '@/components/ui'
import './centre-rooms.css'

interface ExamRoomLayoutDesignerProps {
  rooms: Room[]
  pendingSaveCount?: number
  onSaved?: () => void
}

function cloneLayout(layout: RoomSeatingLayout): RoomSeatingLayout {
  return {
    rows: layout.rows.map((row) => ({ ...row })),
  }
}

type RowEntry = { index: number; row: SeatingLayoutRow }

const ExamRoomLayoutDesigner: React.FC<ExamRoomLayoutDesignerProps> = ({ rooms, pendingSaveCount = 0, onSaved }) => {
  const [expandedRoomId, setExpandedRoomId] = useState<string | null>(null)
  const [layoutDrafts, setLayoutDrafts] = useState<Record<string, RoomSeatingLayout>>({})
  const [savingRoomId, setSavingRoomId] = useState<string | null>(null)
  const [savingAll, setSavingAll] = useState(false)

  const sortedRooms = useMemo(
    () => [...rooms].sort((left, right) =>
      String(left.roomNo || '').localeCompare(String(right.roomNo || ''), undefined, {
        numeric: true,
        sensitivity: 'base',
      })
    ),
    [rooms],
  )

  const totalCapacity = useMemo(
    () => sortedRooms.reduce((sum, room) => sum + calculateLayoutCapacity(getRoomSeatingLayout(room)), 0),
    [sortedRooms],
  )

  useEffect(() => {
    const nextDrafts: Record<string, RoomSeatingLayout> = {}
    sortedRooms.forEach((room) => {
      nextDrafts[room._id] = getRoomSeatingLayout(room)
    })
    setLayoutDrafts(nextDrafts)
  }, [sortedRooms])

  const getDraft = (roomId: string) => layoutDrafts[roomId] || { rows: [{ benchCount: 12, benchType: 'double' }] }

  const updateDraft = (roomId: string, updater: (layout: RoomSeatingLayout) => RoomSeatingLayout) => {
    setLayoutDrafts((prev) => ({
      ...prev,
      [roomId]: updater(cloneLayout(prev[roomId] || getRoomSeatingLayout({ seatingLayout: null }))),
    }))
  }

  const setRowCount = (roomId: string, rowCount: number) => {
    const count = Math.max(1, Math.min(20, Math.floor(rowCount) || 1))
    updateDraft(roomId, (layout) => {
      const rows = [...layout.rows]
      while (rows.length < count) {
        rows.push({ benchCount: 4, benchType: 'double' })
      }
      while (rows.length > count) {
        rows.pop()
      }
      return { rows }
    })
  }

  const updateRow = (roomId: string, rowIndex: number, patch: Partial<SeatingLayoutRow>) => {
    updateDraft(roomId, (layout) => ({
      rows: layout.rows.map((row, index) => (index === rowIndex ? { ...row, ...patch } : row)),
    }))
  }

  const saveRoomLayout = async (roomId: string) => {
    const normalized = normalizeSeatingLayout(getDraft(roomId))
    setSavingRoomId(roomId)
    try {
      await seatingPlanService.updateRoom(roomId, { seatingLayout: normalized })
      toast.success('Room layout saved.')
      onSaved?.()
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'The room layout wasn’t saved. Try again.')
    } finally {
      setSavingRoomId(null)
    }
  }

  const saveAllLayouts = async () => {
    if (sortedRooms.length === 0) return
    setSavingAll(true)
    try {
      await Promise.all(
        sortedRooms.map((room) => {
          const normalized = normalizeSeatingLayout(getDraft(room._id))
          return seatingPlanService.updateRoom(room._id, { seatingLayout: normalized })
        }),
      )
      toast.success(`Saved layouts for ${sortedRooms.length} room(s).`)
      onSaved?.()
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'The room layouts weren’t saved. Try again.')
    } finally {
      setSavingAll(false)
    }
  }

  const isUnsaved = (room: Room) =>
    JSON.stringify(normalizeSeatingLayout(getDraft(room._id))) !== JSON.stringify(getRoomSeatingLayout(room))

  const roomLabel = (room: Room) => room.roomName || `Room ${room.roomNo}`

  const title = 'Seating layouts'
  const subtitle = `Rows, benches and bench type for each exam room · ${totalCapacity} seats saved across ${sortedRooms.length} room(s)`

  if (sortedRooms.length === 0) {
    return (
      <Card title={title} subtitle="Rows, benches and bench type for each exam room">
        <EmptyState
          icon={LayoutGrid}
          title="No exam rooms saved yet"
          body={
            pendingSaveCount > 0
              ? `${pendingSaveCount} room(s) are ticked above. Save exam rooms first, then set their seating layouts here.`
              : 'Tick the rooms to use for exams above and save them. Their seating layouts are set here.'
          }
        />
      </Card>
    )
  }

  const openRoom = sortedRooms.find((room) => room._id === expandedRoomId) || null
  const openDraft = openRoom ? getDraft(openRoom._id) : null

  const columns: DataTableColumn<Room>[] = [
    {
      key: 'order',
      header: '#',
      width: 48,
      numeric: true,
      mobile: 'hidden',
      render: (room) => sortedRooms.indexOf(room) + 1,
    },
    { key: 'roomNo', header: 'Room no.', mobile: 'title', render: (room) => <span className="cb-strong">{room.roomNo}</span> },
    { key: 'roomName', header: 'Room name', mobile: 'subtitle', render: (room) => roomLabel(room) },
    { key: 'rows', header: 'Rows', numeric: true, align: 'right', render: (room) => getDraft(room._id).rows.length },
    {
      key: 'capacity',
      header: 'Seats',
      numeric: true,
      align: 'right',
      mobile: 'aside',
      render: (room) => <span className="cb-strong">{calculateLayoutCapacity(getDraft(room._id))}</span>,
    },
    {
      key: 'status',
      header: 'Layout',
      render: (room) => (isUnsaved(room) ? <Badge tone="warning">Not saved</Badge> : <Badge tone="success">Saved</Badge>),
    },
    {
      key: 'actions',
      header: '',
      headerLabel: 'Actions',
      align: 'right',
      width: 48,
      interactive: true,
      render: (room) => (
        <Menu
          label={`Actions for room ${room.roomNo}`}
          items={[
            { label: 'Design layout', icon: LayoutGrid, onSelect: () => setExpandedRoomId(room._id) },
            {
              label: savingRoomId === room._id ? 'Saving…' : 'Save layout',
              icon: Save,
              disabled: savingRoomId === room._id || savingAll,
              onSelect: () => void saveRoomLayout(room._id),
            },
          ]}
        />
      ),
    },
  ]

  const rowColumns: DataTableColumn<RowEntry>[] = openRoom
    ? [
        { key: 'row', header: 'Row', mobile: 'title', render: ({ index }) => <span className="cb-strong">Row {index + 1}</span> },
        {
          key: 'benches',
          header: 'Benches',
          interactive: true,
          render: ({ index, row }) => (
            <TextField
              size="sm"
              type="number"
              inputMode="numeric"
              min={1}
              max={50}
              aria-label={`Benches in row ${index + 1}`}
              value={row.benchCount}
              onChange={(e) => updateRow(openRoom._id, index, { benchCount: Number(e.target.value) })}
            />
          ),
        },
        {
          key: 'benchType',
          header: 'Bench type',
          interactive: true,
          render: ({ index, row }) => (
            <Select
              size="sm"
              aria-label={`Bench type in row ${index + 1}`}
              value={row.benchType}
              onChange={(e) => updateRow(openRoom._id, index, { benchType: e.target.value as SeatingLayoutRow['benchType'] })}
              options={BENCH_TYPE_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
            />
          ),
        },
        {
          key: 'seats',
          header: 'Seats',
          numeric: true,
          align: 'right',
          mobile: 'aside',
          render: ({ row }) => calculateRowSeats(row),
        },
      ]
    : []

  return (
    <>
      <Card
        flush
        title={title}
        subtitle={subtitle}
        action={
          <Button
            variant="primary"
            icon={Save}
            loading={savingAll}
            disabled={savingRoomId !== null}
            onClick={() => void saveAllLayouts()}
          >
            Save all layouts
          </Button>
        }
      >
        {pendingSaveCount > 0 ? (
          <CardToolbar>
            <Banner tone="warning" title={`${pendingSaveCount} newly ticked room(s) aren’t saved yet`}>
              Save exam rooms above to set their seating layouts here.
            </Banner>
          </CardToolbar>
        ) : null}
        <DataTable
          caption="Seating layouts"
          columns={columns}
          rows={sortedRooms}
          getRowKey={(room) => room._id}
          onRowClick={(room) => setExpandedRoomId(room._id)}
        />
      </Card>

      <Sheet
        open={Boolean(openRoom)}
        onClose={() => setExpandedRoomId(null)}
        size="lg"
        icon={Armchair}
        title={openRoom ? `Seating layout · ${roomLabel(openRoom)}` : 'Seating layout'}
        description="Rows count from the front of the room. Capacity follows the benches and bench type in each row."
        footer={
          openRoom ? (
            <>
              <Button onClick={() => setExpandedRoomId(null)}>Close</Button>
              <Button
                variant="primary"
                loading={savingRoomId === openRoom._id}
                disabled={savingAll}
                onClick={() => void saveRoomLayout(openRoom._id)}
              >
                Save layout
              </Button>
            </>
          ) : null
        }
      >
        {openRoom && openDraft ? (
          <div className="cb-stack">
            <MetricTiles>
              <MetricTile label="Rows" value={openDraft.rows.length} />
              <MetricTile label="Seats" value={calculateLayoutCapacity(openDraft)} hint="Total seating capacity" />
            </MetricTiles>

            <TextField
              label="Number of rows"
              hint="Between 1 and 20"
              type="number"
              inputMode="numeric"
              min={1}
              max={20}
              value={openDraft.rows.length}
              onChange={(e) => setRowCount(openRoom._id, Number(e.target.value))}
            />

            <DataTable
              caption={`Rows in ${roomLabel(openRoom)}`}
              columns={rowColumns}
              rows={openDraft.rows.map((row, index) => ({ index, row }))}
              getRowKey={({ index }) => `${openRoom._id}-row-${index}`}
            />

            <div className="cx-seatmap" aria-label="Seat map preview" role="img">
              <div className="cx-seatmap__front">Front of room</div>
              {openDraft.rows.map((row, rowIndex) => {
                const benches = Math.max(0, Math.min(50, Math.floor(Number(row.benchCount) || 0)))
                const seats = getSeatsPerBench(row.benchType)
                return (
                  <div key={rowIndex} className="cx-seatmap__row">
                    <span className="cx-seatmap__label">Row {rowIndex + 1}</span>
                    <span className="cx-seatmap__benches">
                      {Array.from({ length: benches }, (_, benchIndex) => (
                        <span key={benchIndex} className="cx-seatmap__bench">
                          {Array.from({ length: seats }, (__, seatIndex) => (
                            <span key={seatIndex} className="cx-seatmap__seat" />
                          ))}
                        </span>
                      ))}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        ) : null}
      </Sheet>
    </>
  )
}

export default ExamRoomLayoutDesigner
