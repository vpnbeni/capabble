import React, { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import type { Room } from '../../services/seatingPlanService'
import { seatingPlanService } from '../../services/seatingPlanService'
import {
  BENCH_TYPE_OPTIONS,
  calculateLayoutCapacity,
  calculateRowSeats,
  getRoomSeatingLayout,
  normalizeSeatingLayout,
  type RoomSeatingLayout,
  type SeatingLayoutRow,
} from '../../constants/examRoomLayout'

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
      toast.error(error?.response?.data?.message || 'Failed to save room layout.')
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
      toast.error(error?.response?.data?.message || 'Failed to save room layouts.')
    } finally {
      setSavingAll(false)
    }
  }

  if (sortedRooms.length === 0) {
    return (
      <div className="ra-msg">
        <svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
        </svg>
        {pendingSaveCount > 0
          ? (
            <>
              {pendingSaveCount} room(s) selected above. Click <b>Save Exam Rooms</b> before configuring seating layouts.
            </>
          )
          : (
            <>
              Select exam rooms above and click <b>Save Exam Rooms</b> to configure seating layouts.
            </>
          )}
      </div>
    )
  }

  return (
    <>
      {pendingSaveCount > 0 ? (
        <div className="ra-layout-pending-banner">
          {pendingSaveCount} newly selected room(s) are not saved yet. Click <b>Save Exam Rooms</b> above to include them here.
        </div>
      ) : null}
      <div className="ra-layout-summary">
        <span>{sortedRooms.length} selected exam room(s)</span>
        <span className="ra-layout-summary-divider">·</span>
        <span>{totalCapacity} total seats configured</span>
      </div>

      <div className="ra-table-wrap">
        <table className="ra-table ra-layout-table">
          <thead>
            <tr>
              <th>Sr No</th>
              <th>Room No</th>
              <th>Room Name</th>
              <th>Rows</th>
              <th>Total Capacity</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sortedRooms.map((room, index) => {
              const draft = getDraft(room._id)
              const capacity = calculateLayoutCapacity(draft)
              const isExpanded = expandedRoomId === room._id

              return (
                <React.Fragment key={room._id}>
                  <tr>
                    <td><span className="ra-sr">{index + 1}</span></td>
                    <td><span className="ra-room-no">{room.roomNo}</span></td>
                    <td><span className="ra-room-name">{room.roomName || `Room ${room.roomNo}`}</span></td>
                    <td>{draft.rows.length}</td>
                    <td><span className="ra-layout-capacity">{capacity}</span></td>
                    <td>
                      <div className="ra-action-group">
                        <button
                          type="button"
                          className="ra-action-link ra-action-edit"
                          onClick={() => setExpandedRoomId(isExpanded ? null : room._id)}
                        >
                          {isExpanded ? 'Close' : 'Design Layout'}
                        </button>
                        <button
                          type="button"
                          className="ra-action-link ra-action-save"
                          disabled={savingRoomId === room._id || savingAll}
                          onClick={() => void saveRoomLayout(room._id)}
                        >
                          {savingRoomId === room._id ? 'Saving...' : 'Save'}
                        </button>
                      </div>
                    </td>
                  </tr>
                  {isExpanded ? (
                    <tr className="ra-layout-expand-row">
                      <td colSpan={6}>
                        <div className="ra-layout-editor">
                          <div className="ra-layout-editor-header">
                            <div>
                              <div className="ra-layout-editor-title">Seating layout for {room.roomName || room.roomNo}</div>
                              <div className="ra-layout-editor-subtitle">
                                Configure rows, benches per row, and bench type. Capacity is calculated automatically.
                              </div>
                            </div>
                            <label className="ra-layout-row-count">
                              <span>Number of rows</span>
                              <input
                                type="number"
                                min={1}
                                max={20}
                                value={draft.rows.length}
                                onChange={(e) => setRowCount(room._id, Number(e.target.value))}
                                className="ra-input ra-input-compact"
                              />
                            </label>
                          </div>

                          <table className="ra-layout-rows-table">
                            <thead>
                              <tr>
                                <th>Row</th>
                                <th>Benches in row</th>
                                <th>Bench type</th>
                                <th>Seats in row</th>
                              </tr>
                            </thead>
                            <tbody>
                              {draft.rows.map((row, rowIndex) => (
                                <tr key={`${room._id}-row-${rowIndex}`}>
                                  <td>Row {rowIndex + 1}</td>
                                  <td>
                                    <input
                                      type="number"
                                      min={1}
                                      max={50}
                                      value={row.benchCount}
                                      onChange={(e) => updateRow(room._id, rowIndex, { benchCount: Number(e.target.value) })}
                                      className="ra-input ra-input-compact"
                                    />
                                  </td>
                                  <td>
                                    <select
                                      value={row.benchType}
                                      onChange={(e) => updateRow(room._id, rowIndex, { benchType: e.target.value as SeatingLayoutRow['benchType'] })}
                                      className="ra-input ra-input-compact"
                                    >
                                      {BENCH_TYPE_OPTIONS.map((option) => (
                                        <option key={option.value} value={option.value}>{option.label}</option>
                                      ))}
                                    </select>
                                  </td>
                                  <td><span className="ra-layout-capacity">{calculateRowSeats(row)}</span></td>
                                </tr>
                              ))}
                            </tbody>
                          </table>

                          <div className="ra-layout-editor-footer">
                            <span>Total seating capacity: <strong>{capacity}</strong></span>
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </React.Fragment>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="ra-layout-save-all">
        <button
          type="button"
          className="ra-btn ra-btn-save"
          disabled={savingAll || savingRoomId !== null}
          onClick={() => void saveAllLayouts()}
        >
          {savingAll ? 'Saving...' : 'Save All Layouts'}
        </button>
      </div>
    </>
  )
}

export default ExamRoomLayoutDesigner
