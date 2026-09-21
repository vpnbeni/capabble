import React, { useState, useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { seatingPlanService, Room, type AsetsExamRoomCandidate } from '../services/seatingPlanService'
import centreDatesheetService, { type CentreDatesheetEntry } from '../services/centreDatesheetService'
import { sidebarKeys } from '../hooks/useSidebarCounts'
import ExamRoomLayoutDesigner from '../components/exmcl/ExamRoomLayoutDesigner'
import { calculateLayoutCapacity, getRoomSeatingLayout } from '../constants/examRoomLayout'
import './RoomAllocation.css'

const RoomAllocation: React.FC = () => {
  const queryClient = useQueryClient()
  const routerLocation = useLocation()
  const isExmclRoute = routerLocation.pathname.includes('/exmcl/')
  const [rooms, setRooms] = useState<Room[]>([])
  const [asetsCandidates, setAsetsCandidates] = useState<AsetsExamRoomCandidate[]>([])
  const [examLocationSelection, setExamLocationSelection] = useState<Set<string>>(new Set())
  const [loadingAsets, setLoadingAsets] = useState(false)
  const [savingExamSelection, setSavingExamSelection] = useState(false)
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingData, setEditingData] = useState<Partial<Room>>({})
  const [newRoom, setNewRoom] = useState<Partial<Room>>({
    roomNo: '',
    roomName: '',
    floor: ''
  })
  const [isAddingNew, setIsAddingNew] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [isDeleting, setIsDeleting] = useState(false)
  const [examDates, setExamDates] = useState<string[]>([])
  const [loadingExamDates, setLoadingExamDates] = useState(false)
  const [centreDatesheetEntries, setCentreDatesheetEntries] = useState<CentreDatesheetEntry[]>([])
  const [allocationMode, setAllocationMode] = useState<'auto' | 'manual'>('auto')
  const [loadingAllocationMode, setLoadingAllocationMode] = useState(false)
  const [dateRoomOrderDraft, setDateRoomOrderDraft] = useState<Record<string, string[]>>({})
  const [requiredRoomsByDate, setRequiredRoomsByDate] = useState<Record<string, number>>({})
  const [sharedPositionsByDate, setSharedPositionsByDate] = useState<Record<string, Set<number>>>({})
  const [isSavingAllocation, setIsSavingAllocation] = useState(false)
  const allocTableWrapRef = useRef<HTMLDivElement | null>(null)

  // Scroll allocation table to the current/next exam date column on load
  useEffect(() => {
    const wrap = allocTableWrapRef.current
    if (!wrap || examDates.length === 0) return

    const todayKey = new Date().toISOString().slice(0, 10)

    // Find the nearest exam date that is today or in the future
    const targetDate = examDates.find((d) => d >= todayKey)
      // If all dates are past, fall back to the last exam date
      || examDates[examDates.length - 1]

    const th = wrap.querySelector<HTMLElement>(`[data-date="${targetDate}"]`)
    if (th) {
      // Scroll so the target column is visible, offset by the 3 sticky left columns width
      const stickyWidth = 64 + 96 + 220 // --ra-alloc-col-1 + col-2 + col-3
      wrap.scrollLeft = th.offsetLeft - stickyWidth
    }
  }, [examDates])

  useEffect(() => {
    fetchRooms()
    if (isExmclRoute) {
      void fetchAsetsCandidates()
    } else {
      fetchExamDates()
      fetchAllocationMode()
    }
  }, [isExmclRoute])

  const sortedAsetsCandidates = React.useMemo(
    () => [...asetsCandidates].sort((left, right) => {
      const a = left.roomNumber || left.name
      const b = right.roomNumber || right.name
      return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
    }),
    [asetsCandidates],
  )

  const selectedExamRooms = React.useMemo(() => {
    if (!isExmclRoute) return rooms

    const roomByLocationId = new Map(
      rooms
        .filter((room) => room.assetLocationId)
        .map((room) => [String(room.assetLocationId), room]),
    )

    return sortedAsetsCandidates
      .filter((candidate) => examLocationSelection.has(candidate.locationId))
      .map((candidate) => roomByLocationId.get(candidate.locationId))
      .filter((room): room is Room => Boolean(room))
  }, [isExmclRoute, rooms, examLocationSelection, sortedAsetsCandidates])

  const pendingExamRoomSaveCount = React.useMemo(() => {
    if (!isExmclRoute) return 0
    return sortedAsetsCandidates.filter(
      (candidate) => examLocationSelection.has(candidate.locationId) && !candidate.examRoomId,
    ).length
  }, [isExmclRoute, sortedAsetsCandidates, examLocationSelection])

  const totalExamRoomCapacity = React.useMemo(
    () => selectedExamRooms.reduce((sum, room) => sum + calculateLayoutCapacity(getRoomSeatingLayout(room)), 0),
    [selectedExamRooms],
  )

  const fetchAsetsCandidates = async () => {
    try {
      setLoadingAsets(true)
      const data = await seatingPlanService.getAsetsExamRoomCandidates()
      setAsetsCandidates(data)
      setExamLocationSelection(new Set(data.filter((row) => row.useForExams).map((row) => row.locationId)))
    } catch (error) {
      console.error('Failed to fetch ASETS exam room candidates:', error)
      toast.error('Failed to load rooms from ASETS Locations.')
    } finally {
      setLoadingAsets(false)
    }
  }

  const toggleExamLocation = (locationId: string) => {
    setExamLocationSelection((prev) => {
      const next = new Set(prev)
      if (next.has(locationId)) next.delete(locationId)
      else next.add(locationId)
      return next
    })
  }

  const handleSaveExamRoomSelection = async () => {
    setSavingExamSelection(true)
    try {
      await seatingPlanService.syncExamRoomsFromAsets([...examLocationSelection])
      await Promise.all([fetchRooms(), fetchAsetsCandidates()])
      queryClient.invalidateQueries({ queryKey: sidebarKeys.all })
      toast.success('Exam rooms updated from ASETS selection.')
    } catch (error: any) {
      console.error('Failed to save exam room selection:', error)
      toast.error(error?.response?.data?.message || 'Failed to save exam room selection.')
    } finally {
      setSavingExamSelection(false)
    }
  }

  const normalizeDateKey = (value: string | Date) => {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return ''
    return date.toISOString().slice(0, 10)
  }

  const formatDateLabel = (dateKey: string) => {
    const [year, month, day] = dateKey.split('-')
    if (!year || !month || !day) return dateKey
    return `${day}.${month}.${year.slice(-2)}`
  }

  const toSortedUniqueDateKeys = (values: string[] = []) => (
    Array.from(
      new Set(values.map((value) => normalizeDateKey(value)).filter(Boolean))
    ).sort()
  )

  const compareRoomNo = (left: Room, right: Room) =>
    String(left?.roomNo || '').localeCompare(String(right?.roomNo || ''), undefined, {
      numeric: true,
      sensitivity: 'base',
    })

  const fetchRooms = async () => {
    try {
      setLoading(true)
      const data = await seatingPlanService.getRooms()
      setRooms(data)
    } catch (error) {
      console.error('Failed to fetch rooms:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchExamDates = async () => {
    try {
      setLoadingExamDates(true)
      const response = await centreDatesheetService.getEntries()
      const entries = Array.isArray(response?.data) ? response.data : []
      const filteredEntries = entries.filter(
        (entry) => Number(entry?.candidateCount ?? 0) > 0
      )
      setCentreDatesheetEntries(filteredEntries)
      const nextRequiredRooms: Record<string, number> = {}
      const uniqueDates = Array.from(
        new Set(
          filteredEntries
            .map((entry) => {
              const dateKey = normalizeDateKey(entry.examDate)
              if (dateKey) {
                const roomsNeeded = Number(entry.roomsNeeded || 0)
                const current = nextRequiredRooms[dateKey] || 0
                // Sum room demand across all subjects scheduled on the same date.
                nextRequiredRooms[dateKey] = current + roomsNeeded
              }
              return dateKey
            })
            .filter(Boolean) as string[]
        )
      ).sort()
      setExamDates(uniqueDates)
      setRequiredRoomsByDate(nextRequiredRooms)

      const nextSharedPositions: Record<string, Set<number>> = {}
      filteredEntries.forEach((entry) => {
        const dateKey = normalizeDateKey(entry.examDate)
        if (dateKey && entry.sharedRoomPosition) {
          if (!nextSharedPositions[dateKey]) nextSharedPositions[dateKey] = new Set()
          nextSharedPositions[dateKey].add(entry.sharedRoomPosition)
        }
      })
      setSharedPositionsByDate(nextSharedPositions)
    } catch (error) {
      console.error('Failed to fetch exam dates for allocation:', error)
      setExamDates([])
      setCentreDatesheetEntries([])
      setRequiredRoomsByDate({})
      setSharedPositionsByDate({})
    } finally {
      setLoadingExamDates(false)
    }
  }

  const fetchAllocationMode = async () => {
    try {
      setLoadingAllocationMode(true)
      const mode = await seatingPlanService.getRoomAllocationMode()
      setAllocationMode(mode)
    } catch (error) {
      console.error('Failed to fetch room allocation mode:', error)
      setAllocationMode('auto')
    } finally {
      setLoadingAllocationMode(false)
    }
  }

  useEffect(() => {
    if (rooms.length === 0 || examDates.length === 0) {
      setDateRoomOrderDraft({})
      return
    }

    const draft: Record<string, string[]> = {}
    examDates.forEach((dateKey) => {
      const ordered = rooms
        .map((room) => {
          const mapValue = room.allocationOrderByDate || {}
          const orderValue = Number((mapValue as Record<string, number>)[dateKey])
          return {
            roomId: room._id,
            order: Number.isFinite(orderValue) && orderValue > 0 ? orderValue : null,
            fallbackSelected: (room.allocatedExamDates || []).includes(dateKey),
          }
        })
        .filter((item) => item.order !== null || item.fallbackSelected)
        .sort((a, b) => {
          if (a.order !== null && b.order !== null) return a.order - b.order
          if (a.order !== null) return -1
          if (b.order !== null) return 1
          return 0
        })
        .map((item) => item.roomId)

      draft[dateKey] = ordered
    })
    setDateRoomOrderDraft(draft)
  }, [rooms, examDates])

  const sortedRoomsForAuto = React.useMemo(
    () => [...rooms].sort(compareRoomNo),
    [rooms]
  )

  const autoRoomOrderByDate = React.useMemo(() => {
    const sortedEntries = [...centreDatesheetEntries].sort((a, b) => {
      const dateCompare = normalizeDateKey(a.examDate).localeCompare(normalizeDateKey(b.examDate))
      if (dateCompare !== 0) return dateCompare

      const classA = parseInt(String(a?.class || '').replace(/th$/i, ''), 10) || 0
      const classB = parseInt(String(b?.class || '').replace(/th$/i, ''), 10) || 0
      if (classA !== classB) return classA - classB

      return String(a?.subjectCode || '').localeCompare(String(b?.subjectCode || ''), undefined, {
        numeric: true,
        sensitivity: 'base',
      })
    })

    const dateKeys = [...new Set(sortedEntries.map((entry) => normalizeDateKey(entry.examDate)).filter(Boolean))]
    const firstClassByDate: Record<string, string> = {}
    dateKeys.forEach((dateKey) => {
      const firstEntry = sortedEntries.find((entry) => normalizeDateKey(entry.examDate) === dateKey)
      firstClassByDate[dateKey] = String(firstEntry?.class || '')
    })

    const result: Record<string, string[]> = {}
    examDates.forEach((dateKey) => {
      const requiredRooms = Number(requiredRoomsByDate[dateKey] || 0)
      if (requiredRooms <= 0 || sortedRoomsForAuto.length === 0) {
        result[dateKey] = []
        return
      }

      const dayIndex = dateKeys.indexOf(dateKey)
      let startIndex = 0
      if (dayIndex > 0) {
        const previousDateKey = dateKeys[dayIndex - 1]
        startIndex = firstClassByDate[dateKey] !== firstClassByDate[previousDateKey] ? 0 : 1
      }
      startIndex = Math.min(startIndex, Math.max(sortedRoomsForAuto.length - 1, 0))

      const totalToSelect = Math.min(requiredRooms, sortedRoomsForAuto.length)
      result[dateKey] = Array.from({ length: totalToSelect }, (_, offset) => {
        const room = sortedRoomsForAuto[(startIndex + offset) % sortedRoomsForAuto.length]
        return room?._id || ''
      }).filter(Boolean)
    })

    return result
  }, [centreDatesheetEntries, examDates, requiredRoomsByDate, sortedRoomsForAuto])

  const getDisplayedRoomOrderList = (dateKey: string) =>
    allocationMode === 'auto' ? (autoRoomOrderByDate[dateKey] || []) : (dateRoomOrderDraft[dateKey] || [])

  const toggleRoomDateAllocation = (roomId: string, dateKey: string) => {
    if (allocationMode !== 'manual') return

    setDateRoomOrderDraft((prev) => {
      const roomIdsInOrder = rooms.map((room) => room._id)
      if (!roomIdsInOrder.includes(roomId)) return prev

      const requiredRooms = Number(requiredRoomsByDate[dateKey] || 0)
      const maxSelectable = requiredRooms > 0 ? requiredRooms : roomIdsInOrder.length
      const current = [...(prev[dateKey] || [])]
      const currentIndex = current.indexOf(roomId)

      if (currentIndex < 0) {
        // Adding a room – respect the max-selectable limit
        if (requiredRooms > 0 && current.length >= maxSelectable) {
          return prev
        }

        // Allow selecting any room; append to end so order = click sequence
        return {
          ...prev,
          [dateKey]: [...current, roomId],
        }
      }

      // Deselect: remove from wherever it is; order numbers adjust automatically
      return {
        ...prev,
        [dateKey]: current.filter((id) => id !== roomId),
      }
    })
  }

  const canToggleRoomDateAllocation = (roomId: string, dateKey: string) => {
    if (allocationMode !== 'manual') return false

    const roomIdsInOrder = rooms.map((room) => room._id)
    if (!roomIdsInOrder.includes(roomId)) return false

    const requiredRooms = Number(requiredRoomsByDate[dateKey] || 0)
    const maxSelectable = requiredRooms > 0 ? requiredRooms : roomIdsInOrder.length
    const current = dateRoomOrderDraft[dateKey] || []

    // Already selected → always allow deselect
    if (current.includes(roomId)) return true

    // Not yet selected → allow if below the limit
    return current.length < maxSelectable
  }

  const isRoomSelectedForDate = (roomId: string, dateKey: string) =>
    getDisplayedRoomOrderList(dateKey).includes(roomId)

  const getSelectionOrder = (roomId: string, dateKey: string) => {
    const index = getDisplayedRoomOrderList(dateKey).indexOf(roomId)
    return index >= 0 ? index + 1 : null
  }

  const getAllocatedRoomsCountForDate = (dateKey: string) => getDisplayedRoomOrderList(dateKey).length

  const handleModeChange = async (mode: 'auto' | 'manual') => {
    if (mode === allocationMode) return
    if (mode === 'auto') {
      const maxRoomsRequired = examDates.reduce((max, dateKey) => {
        return Math.max(max, Number(requiredRoomsByDate[dateKey] || 0))
      }, 0)

      if (maxRoomsRequired > 0 && rooms.length < maxRoomsRequired) {
        alert(
          `Maximum number of rooms required at the centre is ${maxRoomsRequired}. You currently have ${rooms.length} room(s). Add more rooms to switch to Auto mode.`
        )
        return
      }
    }

    try {
      setLoadingAllocationMode(true)
      const savedMode = await seatingPlanService.updateRoomAllocationMode(mode)
      setAllocationMode(savedMode)
      toast.success(`Room allocation mode changed to ${savedMode === 'auto' ? 'Auto' : 'Manual'}`)
    } catch (error) {
      console.error('Failed to update room allocation mode:', error)
      toast.error('Failed to update allocation mode')
    } finally {
      setLoadingAllocationMode(false)
    }
  }

  const handleSaveRoomAllocations = async () => {
    if (rooms.length === 0) return

    const updates = rooms
      .map((room) => {
        const nextDates: string[] = []
        const nextOrderByDate: Record<string, number> = {}

        examDates.forEach((dateKey) => {
          const roomOrder = getSelectionOrder(room._id, dateKey)
          if (roomOrder !== null) {
            nextDates.push(dateKey)
            nextOrderByDate[dateKey] = roomOrder
          }
        })

        const currentDates = toSortedUniqueDateKeys(room.allocatedExamDates || [])
        const currentOrderByDate = room.allocationOrderByDate || {}
        const changed = JSON.stringify(currentDates) !== JSON.stringify(toSortedUniqueDateKeys(nextDates))
          || JSON.stringify(currentOrderByDate) !== JSON.stringify(nextOrderByDate)
        if (!changed) return null
        return seatingPlanService.updateRoom(room._id, {
          allocatedExamDates: nextDates,
          allocationOrderByDate: nextOrderByDate,
        })
      })
      .filter(Boolean) as Array<Promise<Room>>

    if (updates.length === 0) {
      toast('No allocation changes to save')
      return
    }

    setIsSavingAllocation(true)
    try {
      await Promise.all(updates)
      await fetchRooms()
      queryClient.invalidateQueries({ queryKey: sidebarKeys.all })
      toast.success(`Saved room allocation for ${updates.length} room(s)`)
    } catch (error) {
      console.error('Failed to save room allocation:', error)
      toast.error('Failed to save room allocation')
    } finally {
      setIsSavingAllocation(false)
    }
  }

  const handleAddRoom = async () => {
    if (newRoom.roomNo && newRoom.floor) {
      try {
        await seatingPlanService.createRoom(newRoom)
        await fetchRooms()
        queryClient.invalidateQueries({ queryKey: sidebarKeys.all })
        setNewRoom({ roomNo: '', roomName: '', floor: '' })
        setIsAddingNew(false)
      } catch (error: any) {
        console.error('Failed to add room:', error)
        const message = error?.response?.data?.message || 'Failed to add room'
        alert(message)
      }
    }
  }

  const handleEditRoom = (room: Room) => {
    setEditingId(room._id)
    setEditingData(room)
  }

  const handleSaveRoom = async (id: string) => {
    try {
      await seatingPlanService.updateRoom(id, editingData)
      await fetchRooms()
      queryClient.invalidateQueries({ queryKey: sidebarKeys.all })
      setEditingId(null)
      setEditingData({})
    } catch (error: any) {
      console.error('Failed to update room:', error)
      const message = error?.response?.data?.message || 'Failed to update room'
      alert(message)
    }
  }

  const toggleSelection = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAllOnPage = () => {
    const ids = rooms.map((r) => r._id)
    const allSelected = ids.length > 0 && ids.every((id) => selectedIds.has(id))
    if (allSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev)
        ids.forEach((id) => next.delete(id))
        return next
      })
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev)
        ids.forEach((id) => next.add(id))
        return next
      })
    }
  }

  const clearSelection = () => setSelectedIds(new Set())

  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) return
    if (!window.confirm(`Delete ${selectedIds.size} selected room(s)? This cannot be undone.`)) return
    setIsDeleting(true)
    const ids = Array.from(selectedIds)
    try {
      await Promise.all(ids.map((id) => seatingPlanService.deleteRoom(id)))
      clearSelection()
      await fetchRooms()
      queryClient.invalidateQueries({ queryKey: sidebarKeys.all })
    } catch (error) {
      console.error('Failed to delete rooms:', error)
      alert('Failed to delete some rooms')
    } finally {
      setIsDeleting(false)
    }
  }

  const allOnPageSelected = rooms.length > 0 && rooms.every((r) => selectedIds.has(r._id))
  const someOnPageSelected = rooms.some((r) => selectedIds.has(r._id))

  const handleCancelEdit = () => {
    setEditingId(null)
    setEditingData({})
    setIsAddingNew(false)
    setNewRoom({ roomNo: '', roomName: '', floor: '' })
  }

  if (loading) {
    return (
      <div className="p-6 flex justify-center items-center">
        <div className="text-gray-600 dark:text-gray-400">Loading rooms...</div>
      </div>
    )
  }

  return (
    <div className="ra-page">
      <style>{`
        /* ───────── Page ───────── */
        .ra-page {
          padding: 32px;
          max-width: 1600px;
          margin: 0 auto;
        }

        /* ───────── Section cards ───────── */
        .ra-card {
          background: #fff;
          border-radius: 16px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.06), 0 6px 24px rgba(0,0,0,0.04);
          overflow: hidden;
          margin-bottom: 32px;
          border: 1px solid #e8ecf1;
          transition: box-shadow 0.3s ease;
        }
        .ra-card:hover {
          box-shadow: 0 2px 6px rgba(0,0,0,0.08), 0 10px 36px rgba(0,0,0,0.06);
        }
        .dark .ra-card {
          background: #1e293b;
          border-color: #334155;
        }

        /* ───────── Section headers ───────── */
        .ra-card-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 20px 28px;
          background: linear-gradient(135deg, #f0f4ff 0%, #faf5ff 100%);
          border-bottom: 1px solid #e2e8f0;
        }
        .dark .ra-card-header {
          background: linear-gradient(135deg, #1e2a3e 0%, #2a1e3e 100%);
          border-color: #334155;
        }
        .ra-card-header h3 {
          font-size: 1.15rem;
          font-weight: 700;
          color: #1e293b;
          margin: 0;
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .dark .ra-card-header h3 {
          color: #f1f5f9;
        }
        .ra-card-header h3 .ra-header-icon {
          width: 28px;
          height: 28px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .ra-card-header h3 .ra-header-icon svg {
          width: 18px;
          height: 18px;
          color: #fff;
        }

        .ra-card-subtitle {
          font-size: 0.82rem;
          color: #64748b;
          margin-top: 4px;
          font-weight: 400;
        }
        .dark .ra-card-subtitle {
          color: #94a3b8;
        }

        /* ───────── Buttons ───────── */
        .ra-btn-group {
          display: flex;
          gap: 10px;
          align-items: center;
          flex-wrap: wrap;
        }
        .ra-header-stats {
          display: flex;
          align-items: center;
          gap: 10px;
          flex: 1;
          justify-content: center;
          min-width: 0;
          overflow-x: auto;
          padding: 2px 8px;
        }
        .ra-stat-card-inline {
          min-width: 82px;
          flex: 0 0 auto;
          padding: 6px 7px;
          border-radius: 8px;
          gap: 6px;
        }
        .ra-stat-card-inline .ra-stat-icon {
          width: 22px;
          height: 22px;
          border-radius: 6px;
        }
        .ra-stat-card-inline .ra-stat-icon svg {
          width: 12px;
          height: 12px;
        }
        .ra-stat-card-inline .ra-stat-value {
          font-size: 0.95rem;
          line-height: 1.05;
        }
        .ra-stat-card-inline .ra-stat-label {
          font-size: 0.5rem;
          letter-spacing: 0.04em;
        }
        .ra-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 8px 18px;
          border-radius: 10px;
          font-size: 0.82rem;
          font-weight: 600;
          border: none;
          cursor: pointer;
          transition: all 0.2s ease;
          white-space: nowrap;
        }
        .ra-btn svg { width: 16px; height: 16px; }
        .ra-btn:disabled { opacity: 0.5; cursor: not-allowed; }

        .ra-btn-primary {
          background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
          color: #fff;
          box-shadow: 0 2px 10px rgba(99, 102, 241, 0.35);
        }
        .ra-btn-primary:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 4px 16px rgba(99, 102, 241, 0.45);
        }
        .ra-btn-secondary {
          background: #fff;
          color: #475569;
          border: 1.5px solid #e2e8f0;
          box-shadow: 0 1px 3px rgba(0,0,0,0.04);
        }
        .dark .ra-btn-secondary {
          background: #334155;
          color: #e2e8f0;
          border-color: #475569;
        }
        .ra-btn-secondary:hover:not(:disabled) {
          background: #f8fafc;
          border-color: #cbd5e1;
          transform: translateY(-1px);
        }
        .dark .ra-btn-secondary:hover:not(:disabled) {
          background: #3b4f6b;
        }
        .ra-btn-danger {
          background: #fff;
          color: #ef4444;
          border: 1.5px solid #fecaca;
          box-shadow: 0 1px 3px rgba(239, 68, 68, 0.1);
        }
        .ra-btn-danger:hover:not(:disabled) {
          background: #fef2f2;
          border-color: #fca5a5;
          transform: translateY(-1px);
        }
        .ra-btn-save {
          background: linear-gradient(135deg, #10b981 0%, #059669 100%);
          color: #fff;
          box-shadow: 0 2px 10px rgba(16, 185, 129, 0.35);
        }
        .ra-btn-save:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 4px 16px rgba(16, 185, 129, 0.45);
        }

        /* ───────── Table ───────── */
        .ra-table-wrap {
          overflow-x: auto;
        }
        .ra-room-table-wrap {
        }
        .ra-room-table-wrap .ra-table thead th {
        }
        .ra-table {
          width: 100%;
          border-collapse: separate;
          border-spacing: 0;
        }
        .ra-table thead th {
          padding: 14px 20px;
          font-size: 0.72rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: #64748b;
          background: #f8fafc;
          border-bottom: 2px solid #e2e8f0;
          text-align: left;
          white-space: nowrap;
        }
        .dark .ra-table thead th {
          background: #1e293b;
          color: #94a3b8;
          border-color: #334155;
        }
        .ra-table tbody tr {
          transition: background 0.15s ease;
        }
        .ra-table tbody tr:hover {
          background: #f1f5f9;
        }
        .dark .ra-table tbody tr:hover {
          background: #283548;
        }
        .ra-table tbody tr:nth-child(even) {
          background: #fafbfd;
        }
        .dark .ra-table tbody tr:nth-child(even) {
          background: #1a2536;
        }
        .ra-table tbody tr:nth-child(even):hover {
          background: #f1f5f9;
        }
        .dark .ra-table tbody tr:nth-child(even):hover {
          background: #283548;
        }
        .ra-table tbody td {
          padding: 14px 20px;
          font-size: 0.88rem;
          color: #334155;
          border-bottom: 1px solid #f1f5f9;
          white-space: nowrap;
        }
        .dark .ra-table tbody td {
          color: #e2e8f0;
          border-color: #1e293b;
        }

        /* Serial numbers */
        .ra-sr {
          font-weight: 600;
          color: #94a3b8;
          font-size: 0.82rem;
          min-width: 32px;
          display: inline-block;
        }
        /* Room number */
        .ra-room-no {
          font-weight: 700;
          color: #1e293b;
          font-size: 0.9rem;
        }
        .dark .ra-room-no { color: #f1f5f9; }
        /* Room name */
        .ra-room-name {
          color: #475569;
          font-weight: 500;
        }
        .dark .ra-room-name { color: #cbd5e1; }

        /* Floor badges */
        .ra-floor-badge {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 4px 12px;
          border-radius: 20px;
          font-size: 0.75rem;
          font-weight: 600;
          letter-spacing: 0.01em;
        }
        .ra-floor-ground { background: #ecfdf5; color: #059669; }
        .ra-floor-first { background: #eff6ff; color: #2563eb; }
        .ra-floor-second { background: #fef3c7; color: #d97706; }
        .ra-floor-third { background: #f3e8ff; color: #7c3aed; }
        .ra-floor-default { background: #f1f5f9; color: #475569; }
        .dark .ra-floor-ground { background: #064e3b33; color: #34d399; }
        .dark .ra-floor-first { background: #1e3a5f33; color: #60a5fa; }
        .dark .ra-floor-second { background: #78350f33; color: #fbbf24; }
        .dark .ra-floor-third { background: #4c1d9533; color: #a78bfa; }
        .dark .ra-floor-default { background: #33415533; color: #94a3b8; }

        /* Action links */
        .ra-action-link {
          font-size: 0.82rem;
          font-weight: 600;
          padding: 4px 12px;
          border-radius: 6px;
          border: none;
          background: none;
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .ra-action-edit {
          color: #6366f1;
        }
        .ra-action-edit:hover {
          background: #eef2ff;
          color: #4f46e5;
        }
        .dark .ra-action-edit { color: #818cf8; }
        .dark .ra-action-edit:hover { background: #312e8133; }
        .ra-action-save {
          color: #10b981;
        }
        .ra-action-save:hover {
          background: #ecfdf5;
          color: #059669;
        }
        .ra-action-cancel {
          color: #94a3b8;
        }
        .ra-action-cancel:hover {
          background: #f1f5f9;
          color: #64748b;
        }

        /* Checkbox in header */
        .ra-table thead th:first-child,
        .ra-table tbody td:first-child {
          width: 48px;
          padding-left: 20px;
          padding-right: 8px;
        }

        /* New room row */
        .ra-new-row {
          background: linear-gradient(90deg, #eef2ff 0%, #f5f3ff 100%) !important;
        }
        .dark .ra-new-row {
          background: linear-gradient(90deg, #1e2a4a 0%, #2a1e4a 100%) !important;
        }

        /* ───────── Allocation matrix ───────── */
        .ra-alloc-table {
          width: 100%;
          border-collapse: collapse;
          --ra-alloc-col-1: 64px;
          --ra-alloc-col-2: 96px;
          --ra-alloc-col-3: 220px;
        }
        .ra-alloc-table thead th {
          padding: 12px 14px;
          font-size: 0.72rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          color: #475569;
          background: linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%);
          border: 1px solid #e2e8f0;
          text-align: center;
          white-space: nowrap;
        }
        .dark .ra-alloc-table thead th {
          background: linear-gradient(180deg, #1e293b 0%, #1a2536 100%);
          color: #94a3b8;
          border-color: #334155;
        }
        .ra-alloc-table thead th:nth-child(1),
        .ra-alloc-table thead th:nth-child(2),
        .ra-alloc-table thead th:nth-child(3) {
          text-align: left;
        }
        .ra-alloc-table tbody td {
          padding: 10px 14px;
          font-size: 0.85rem;
          color: #334155;
          border: 1px solid #e2e8f0;
          text-align: center;
          transition: background 0.15s ease;
        }
        .dark .ra-alloc-table tbody td {
          color: #e2e8f0;
          border-color: #334155;
        }
        .ra-alloc-table tbody td:nth-child(1),
        .ra-alloc-table tbody td:nth-child(2),
        .ra-alloc-table tbody td:nth-child(3) {
          text-align: left;
        }
        .ra-alloc-table thead tr:first-child th:nth-child(1),
        .ra-alloc-table tbody td:nth-child(1) {
          width: var(--ra-alloc-col-1);
          min-width: var(--ra-alloc-col-1);
        }
        .ra-alloc-table thead tr:first-child th:nth-child(2),
        .ra-alloc-table tbody td:nth-child(2) {
          width: var(--ra-alloc-col-2);
          min-width: var(--ra-alloc-col-2);
        }
        .ra-alloc-table thead tr:first-child th:nth-child(3),
        .ra-alloc-table tbody td:nth-child(3) {
          width: var(--ra-alloc-col-3);
          min-width: var(--ra-alloc-col-3);
        }
        .ra-alloc-table thead tr:first-child th:nth-child(1),
        .ra-alloc-table tbody td:nth-child(1) {
          position: sticky;
          left: 0;
        }
        .ra-alloc-table thead tr:first-child th:nth-child(2),
        .ra-alloc-table tbody td:nth-child(2) {
          position: sticky;
          left: var(--ra-alloc-col-1);
        }
        .ra-alloc-table thead tr:first-child th:nth-child(3),
        .ra-alloc-table tbody td:nth-child(3) {
          position: sticky;
          left: calc(var(--ra-alloc-col-1) + var(--ra-alloc-col-2));
          box-shadow: 2px 0 0 rgba(148, 163, 184, 0.28);
        }
        .ra-alloc-table thead tr.ra-required-row th:first-child {
          position: sticky;
          left: 0;
          min-width: calc(var(--ra-alloc-col-1) + var(--ra-alloc-col-2) + var(--ra-alloc-col-3));
          box-shadow: 2px 0 0 rgba(148, 163, 184, 0.28);
          z-index: 6;
        }
        .ra-alloc-table thead tr:first-child th:nth-child(1),
        .ra-alloc-table thead tr:first-child th:nth-child(2),
        .ra-alloc-table thead tr:first-child th:nth-child(3) {
          z-index: 7;
        }
        .ra-alloc-table tbody td:nth-child(1),
        .ra-alloc-table tbody td:nth-child(2),
        .ra-alloc-table tbody td:nth-child(3) {
          z-index: 2;
          background: #ffffff;
        }
        .ra-alloc-table tbody tr:hover td {
          background: #f0f4ff;
        }
        .ra-alloc-table tbody tr:hover td:nth-child(1),
        .ra-alloc-table tbody tr:hover td:nth-child(2),
        .ra-alloc-table tbody tr:hover td:nth-child(3) {
          background: #f0f4ff;
        }
        .dark .ra-alloc-table tbody tr:hover td {
          background: #283548;
        }
        .dark .ra-alloc-table tbody td:nth-child(1),
        .dark .ra-alloc-table tbody td:nth-child(2),
        .dark .ra-alloc-table tbody td:nth-child(3) {
          background: #0f172a;
        }
        .dark .ra-alloc-table tbody tr:hover td:nth-child(1),
        .dark .ra-alloc-table tbody tr:hover td:nth-child(2),
        .dark .ra-alloc-table tbody tr:hover td:nth-child(3) {
          background: #283548;
        }

        /* Required rooms row */
        .ra-required-row th {
          background: linear-gradient(90deg, #fef3c7 0%, #fef9c3 100%) !important;
          color: #92400e !important;
          font-size: 0.72rem !important;
          padding: 8px 14px !important;
          font-weight: 700 !important;
        }
        .dark .ra-required-row th {
          background: linear-gradient(90deg, #78350f33 0%, #713f1233 100%) !important;
          color: #fbbf24 !important;
        }
        .ra-required-row .ra-required-cell {
          font-variant-numeric: tabular-nums;
        }
        .ra-required-row .ra-required-pending {
          background: linear-gradient(90deg, #fee2e2 0%, #fecaca 100%) !important;
          color: #b91c1c !important;
        }
        .ra-required-row .ra-required-complete {
          background: linear-gradient(90deg, #dcfce7 0%, #bbf7d0 100%) !important;
          color: #166534 !important;
        }
        .ra-required-row .ra-required-none {
          background: linear-gradient(90deg, #f1f5f9 0%, #e2e8f0 100%) !important;
          color: #475569 !important;
        }
        .dark .ra-required-row .ra-required-pending {
          background: linear-gradient(90deg, #7f1d1d66 0%, #991b1b66 100%) !important;
          color: #fca5a5 !important;
        }
        .dark .ra-required-row .ra-required-complete {
          background: linear-gradient(90deg, #14532d66 0%, #16653466 100%) !important;
          color: #86efac !important;
        }
        .dark .ra-required-row .ra-required-none {
          background: linear-gradient(90deg, #33415566 0%, #1e293b66 100%) !important;
          color: #cbd5e1 !important;
        }

        /* Allocation checkbox cell */
        .ra-alloc-cell {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 3px;
        }
        .ra-alloc-cell input[type="checkbox"] {
          width: 18px;
          height: 18px;
          border-radius: 4px;
          cursor: pointer;
          accent-color: #6366f1;
        }
        .ra-alloc-cell input[type="checkbox"]:disabled {
          cursor: not-allowed;
          opacity: 0.35;
        }
        .ra-alloc-order {
          font-size: 10px;
          font-weight: 800;
          color: #fff;
          background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
          border-radius: 10px;
          padding: 1px 7px;
          min-width: 22px;
          text-align: center;
          line-height: 1.5;
          box-shadow: 0 1px 4px rgba(99, 102, 241, 0.35);
        }
        .ra-shared-tag {
          font-size: 9px;
          font-style: italic;
          font-weight: 600;
          color: #d97706;
          background: #fef3c7;
          border-radius: 8px;
          padding: 1px 6px;
          line-height: 1.5;
        }
        .dark .ra-shared-tag {
          color: #fbbf24;
          background: rgba(251, 191, 36, 0.15);
        }

        /* ───────── Room stat cards ───────── */
        .ra-stats {
          display: flex;
          gap: 16px;
          padding: 20px 28px;
          border-bottom: 1px solid #e8ecf1;
          flex-wrap: wrap;
        }
        .dark .ra-stats { border-color: #334155; }
        .ra-stat-card {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 14px 20px;
          border-radius: 12px;
          min-width: 160px;
          flex: 1;
        }
        .ra-stat-icon {
          width: 40px;
          height: 40px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .ra-stat-icon svg { width: 20px; height: 20px; color: #fff; }
        .ra-stat-value {
          font-size: 1.4rem;
          font-weight: 800;
          line-height: 1.2;
          color: #1e293b;
        }
        .dark .ra-stat-value { color: #f1f5f9; }
        .ra-stat-label {
          font-size: 0.72rem;
          font-weight: 600;
          color: #94a3b8;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        /* Force compact cards in Examination Rooms header */
        .ra-header-stats .ra-stat-card {
          min-width: 82px;
          flex: 0 0 auto;
          padding: 6px 7px;
          border-radius: 8px;
          gap: 6px;
        }
        .ra-header-stats .ra-stat-icon {
          width: 22px;
          height: 22px;
          border-radius: 6px;
        }
        .ra-header-stats .ra-stat-icon svg {
          width: 12px;
          height: 12px;
        }
        .ra-header-stats .ra-stat-value {
          font-size: 0.95rem;
          line-height: 1.05;
        }
        .ra-header-stats .ra-stat-label {
          font-size: 0.5rem;
          letter-spacing: 0.04em;
        }

        /* ───────── Empty state ───────── */
        .ra-empty {
          padding: 48px 24px;
          text-align: center;
        }
        .ra-empty-icon {
          width: 64px;
          height: 64px;
          margin: 0 auto 16px;
          border-radius: 16px;
          background: linear-gradient(135deg, #f0f4ff 0%, #faf5ff 100%);
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .ra-empty-icon svg {
          width: 32px;
          height: 32px;
          color: #94a3b8;
        }
        .ra-empty h3 {
          font-size: 1.05rem;
          font-weight: 700;
          color: #334155;
          margin: 0 0 6px;
        }
        .ra-empty p {
          color: #94a3b8;
          font-size: 0.88rem;
          margin: 0 0 20px;
        }

        /* ───────── Inputs ───────── */
        .ra-input {
          width: 100%;
          padding: 6px 12px;
          border: 1.5px solid #e2e8f0;
          border-radius: 8px;
          font-size: 0.85rem;
          transition: all 0.2s ease;
          outline: none;
          background: #fff;
          color: #334155;
        }
        .dark .ra-input {
          background: #1e293b;
          border-color: #475569;
          color: #e2e8f0;
        }
        .ra-input:focus {
          border-color: #6366f1;
          box-shadow: 0 0 0 3px rgba(99,102,241,0.15);
        }

        /* ───────── Message bar ───────── */
        .ra-msg {
          padding: 24px 28px;
          font-size: 0.88rem;
          color: #64748b;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .ra-msg svg { width: 18px; height: 18px; flex-shrink: 0; }
      `}</style>

      {/* ═══════ Rooms Table Card ═══════ */}
      <div className="ra-card">
        <div className="ra-card-header">
          <div>
            <h3>
              <span className="ra-header-icon ra-bg-indigo-grad">
                <svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
                </svg>
              </span>
              Examination Rooms
            </h3>
          </div>
          <div className="ra-header-stats">
            <div className="ra-stat-card ra-stat-card-inline ra-bg-indigo-soft">
              <div className="ra-stat-icon ra-bg-indigo-grad">
                <svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
                </svg>
              </div>
              <div>
                <div className="ra-stat-value">{isExmclRoute ? asetsCandidates.length : rooms.length}</div>
                <div className="ra-stat-label">{isExmclRoute ? 'ASETS Rooms' : 'Total Rooms'}</div>
              </div>
            </div>
            {isExmclRoute ? (
              <>
                <div className="ra-stat-card ra-stat-card-inline ra-bg-green-soft">
                  <div className="ra-stat-icon ra-bg-green-grad">
                    <svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div>
                    <div className="ra-stat-value">{examLocationSelection.size}</div>
                    <div className="ra-stat-label">Used for Exams</div>
                  </div>
                </div>
                <div className="ra-stat-card ra-stat-card-inline ra-bg-amber-soft">
                  <div className="ra-stat-icon ra-bg-amber-grad">
                    <svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
                    </svg>
                  </div>
                  <div>
                    <div className="ra-stat-value">{totalExamRoomCapacity}</div>
                    <div className="ra-stat-label">Total Seats</div>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="ra-stat-card ra-stat-card-inline ra-bg-green-soft">
                  <div className="ra-stat-icon ra-bg-green-grad">
                    <svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                    </svg>
                  </div>
                  <div>
                    <div className="ra-stat-value">{examDates.length}</div>
                    <div className="ra-stat-label">Exam Dates</div>
                  </div>
                </div>
                <div className="ra-stat-card ra-stat-card-inline ra-bg-amber-soft">
                  <div className="ra-stat-icon ra-bg-amber-grad">
                    <svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 7.5L7.5 3m0 0L12 7.5M7.5 3v13.5m13.5 0L16.5 21m0 0L12 16.5m4.5 4.5V7.5" />
                    </svg>
                  </div>
                  <div>
                    <div className="ra-stat-value ra-text-capitalize">{allocationMode}</div>
                    <div className="ra-stat-label">Mode</div>
                  </div>
                </div>
              </>
            )}
          </div>
          <div className="ra-btn-group">
            {isExmclRoute ? (
              <>
                <button
                  onClick={() => void fetchAsetsCandidates()}
                  disabled={loadingAsets}
                  className="ra-btn ra-btn-secondary"
                >
                  Refresh from ASETS
                </button>
                <button
                  onClick={handleSaveExamRoomSelection}
                  disabled={savingExamSelection || loadingAsets}
                  className="ra-btn ra-btn-primary"
                >
                  Save Exam Rooms
                </button>
              </>
            ) : (
              <>
                {selectedIds.size > 0 && (
                  <button
                    onClick={handleDeleteSelected}
                    disabled={isDeleting}
                    className="ra-btn ra-btn-danger"
                  >
                    <svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                    </svg>
                    Delete {selectedIds.size}
                  </button>
                )}
                <button
                  onClick={() => setIsAddingNew(true)}
                  disabled={isAddingNew}
                  className="ra-btn ra-btn-primary"
                >
                  <svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m6-6H6" />
                  </svg>
                  Add Room
                </button>
              </>
            )}
          </div>
        </div>

        {isExmclRoute ? (
          <div className="ra-msg" style={{ borderTop: '1px solid #e2e8f0' }}>
            Rooms are loaded from <b>ASETS → Locations</b>. Tick the rooms to use for exams, then click <b>Save Exam Rooms</b>.
          </div>
        ) : null}

        {/* Rooms list table */}
        <div className="ra-table-wrap ra-room-table-wrap">
          <table className="ra-table">
            <thead>
              <tr>
                <th>
                  {isExmclRoute ? 'Use for Exams' : (
                    <label className="ra-checkbox-label">
                      <input
                        type="checkbox"
                        checked={allOnPageSelected}
                        ref={(el) => {
                          if (el) el.indeterminate = someOnPageSelected && !allOnPageSelected
                        }}
                        onChange={selectAllOnPage}
                        className="ra-checkbox"
                        aria-label="Select all on page"
                      />
                    </label>
                  )}
                </th>
                <th>Sr No</th>
                <th>Room No</th>
                <th>Room Name</th>
                {isExmclRoute ? <th>Class / Section</th> : null}
                <th>Floor</th>
                {!isExmclRoute ? <th>Actions</th> : null}
              </tr>
            </thead>
            <tbody>
              {isExmclRoute ? (
                loadingAsets ? (
                  <tr>
                    <td colSpan={6}>
                      <div className="ra-msg">Loading rooms from ASETS Locations...</div>
                    </td>
                  </tr>
                ) : sortedAsetsCandidates.length === 0 ? (
                  <tr>
                    <td colSpan={6}>
                      <div className="ra-empty">
                        <div className="ra-empty-icon">
                          <svg fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
                          </svg>
                        </div>
                        <h3>No ASETS Rooms Found</h3>
                        <p>Add rooms under ASETS → Locations first, then return here to select exam rooms.</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  sortedAsetsCandidates.map((candidate, index) => {
                    const floorClass =
                      candidate.floor === 'Ground Floor' ? 'ra-floor-ground' :
                        candidate.floor === 'First Floor' ? 'ra-floor-first' :
                          candidate.floor === 'Second Floor' ? 'ra-floor-second' :
                            candidate.floor === 'Third Floor' ? 'ra-floor-third' :
                              'ra-floor-default'

                    return (
                      <tr key={candidate.locationId}>
                        <td>
                          <label className="ra-checkbox-label">
                            <input
                              type="checkbox"
                              checked={examLocationSelection.has(candidate.locationId)}
                              onChange={() => toggleExamLocation(candidate.locationId)}
                              className="ra-checkbox"
                              aria-label={`Use ${candidate.name} for exams`}
                            />
                          </label>
                        </td>
                        <td><span className="ra-sr">{index + 1}</span></td>
                        <td><span className="ra-room-no">{candidate.roomNumber || '—'}</span></td>
                        <td><span className="ra-room-name">{candidate.name}</span></td>
                        <td><span className="ra-room-name">{candidate.classSection || '—'}</span></td>
                        <td><span className={`ra-floor-badge ${floorClass}`}>{candidate.floor}</span></td>
                      </tr>
                    )
                  })
                )
              ) : (
                <>
              {/* Add New Room Row */}
              {isAddingNew && (
                <tr className="ra-new-row">
                  <td />
                  <td><span className="ra-sr">—</span></td>
                  <td>
                    <input
                      type="text"
                      title="Room number"
                      value={newRoom.roomNo}
                      onChange={(e) => setNewRoom({ ...newRoom, roomNo: e.target.value })}
                      placeholder="Room No"
                      className="ra-input"
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      title="Room name"
                      value={newRoom.roomName}
                      onChange={(e) => setNewRoom({ ...newRoom, roomName: e.target.value })}
                      placeholder="Room Name"
                      className="ra-input"
                    />
                  </td>
                  <td>
                    <select
                      title="Room floor"
                      value={newRoom.floor}
                      onChange={(e) => setNewRoom({ ...newRoom, floor: e.target.value })}
                      className="ra-input"
                    >
                      <option value="">Select Floor</option>
                      <option value="Ground Floor">Ground Floor</option>
                      <option value="First Floor">First Floor</option>
                      <option value="Second Floor">Second Floor</option>
                      <option value="Third Floor">Third Floor</option>
                    </select>
                  </td>
                  <td className="ra-action-group">
                    <button onClick={handleAddRoom} className="ra-action-link ra-action-save">Save</button>
                    <button onClick={handleCancelEdit} className="ra-action-link ra-action-cancel">Cancel</button>
                  </td>
                </tr>
              )}

              {/* Existing Rooms */}
              {rooms.map((room, index) => {
                const isEditing = editingId === room._id
                const floorClass =
                  room.floor === 'Ground Floor' ? 'ra-floor-ground' :
                    room.floor === 'First Floor' ? 'ra-floor-first' :
                      room.floor === 'Second Floor' ? 'ra-floor-second' :
                        room.floor === 'Third Floor' ? 'ra-floor-third' :
                          'ra-floor-default'

                return (
                  <tr key={room._id}>
                    <td>
                      <label className="ra-checkbox-label">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(room._id)}
                          onChange={() => toggleSelection(room._id)}
                          className="ra-checkbox"
                          aria-label={`Select room ${room.roomNo}`}
                        />
                      </label>
                    </td>
                    <td><span className="ra-sr">{index + 1}</span></td>
                    <td>
                      {isEditing ? (
                        <input
                          type="text"
                          title="Edit room number"
                          placeholder="Room No"
                          value={editingData.roomNo || ''}
                          onChange={(e) => setEditingData({ ...editingData, roomNo: e.target.value })}
                          className="ra-input"
                        />
                      ) : (
                        <span className="ra-room-no">{room.roomNo}</span>
                      )}
                    </td>
                    <td>
                      {isEditing ? (
                        <input
                          type="text"
                          title="Edit room name"
                          placeholder="Room Name"
                          value={editingData.roomName || ''}
                          onChange={(e) => setEditingData({ ...editingData, roomName: e.target.value })}
                          className="ra-input"
                        />
                      ) : (
                        <span className="ra-room-name">{room.roomName}</span>
                      )}
                    </td>
                    <td>
                      {isEditing ? (
                        <select
                          title="Edit room floor"
                          value={editingData.floor || ''}
                          onChange={(e) => setEditingData({ ...editingData, floor: e.target.value })}
                          className="ra-input"
                        >
                          <option value="Ground Floor">Ground Floor</option>
                          <option value="First Floor">First Floor</option>
                          <option value="Second Floor">Second Floor</option>
                          <option value="Third Floor">Third Floor</option>
                        </select>
                      ) : (
                        <span className={`ra-floor-badge ${floorClass}`}>{room.floor}</span>
                      )}
                    </td>
                    <td>
                      {isEditing ? (
                        <div className="ra-action-group">
                          <button onClick={() => handleSaveRoom(room._id)} className="ra-action-link ra-action-save">Save</button>
                          <button onClick={handleCancelEdit} className="ra-action-link ra-action-cancel">Cancel</button>
                        </div>
                      ) : (
                        <button onClick={() => handleEditRoom(room)} className="ra-action-link ra-action-edit">
                          <svg className="ra-edit-icon" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
                          </svg>
                          Edit
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}

              {/* Empty State */}
              {rooms.length === 0 && !isAddingNew && (
                <tr>
                  <td colSpan={6}>
                    <div className="ra-empty">
                      <div className="ra-empty-icon">
                        <svg fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
                        </svg>
                      </div>
                      <h3>No Rooms Available</h3>
                      <p>Add examination rooms and configure seating arrangements for your exams.</p>
                      <button onClick={() => setIsAddingNew(true)} className="ra-btn ra-btn-primary">
                        <svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m6-6H6" />
                        </svg>
                        Add Room
                      </button>
                    </div>
                  </td>
                </tr>
              )}
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ═══════ Room Layout (EXMCL) / Allocation Matrix (CNTR) ═══════ */}
      <div className="ra-card">
        <div className="ra-card-header">
          <div>
            <h3>
              <span className={`ra-header-icon ${isExmclRoute ? 'ra-bg-indigo-grad' : 'ra-bg-green-grad'}`}>
                <svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  {isExmclRoute ? (
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 8.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                  )}
                </svg>
              </span>
              {isExmclRoute ? 'Room Seating Layout' : 'Room Allocation by Date'}
            </h3>
            <div className="ra-card-subtitle">
              {isExmclRoute
                ? 'Design the physical seating layout for each selected exam room. Capacity is calculated from rows, benches, and bench type.'
                : allocationMode === 'auto'
                  ? 'Auto mode active: system will allocate rooms automatically by allocation guidelines.'
                  : 'Manual mode active: select rooms in any order for each date. Selection order determines usage priority.'}
            </div>
          </div>
          {!isExmclRoute ? (
            <div className="ra-btn-group">
              <div className="ra-mode-switch-wrap">
                <span className="ra-mode-switch-label">Manual</span>
                <button
                  type="button"
                  aria-label={allocationMode === 'manual' ? 'Allocation mode: Manual. Click to switch to Auto.' : 'Allocation mode: Auto. Click to switch to Manual.'}
                  disabled={loadingAllocationMode}
                  onClick={() => handleModeChange(allocationMode === 'auto' ? 'manual' : 'auto')}
                  className={`ra-mode-switch ${allocationMode === 'auto' ? 'ra-mode-switch-on' : ''}`}
                >
                  <span className={`ra-mode-switch-thumb ${allocationMode === 'auto' ? 'ra-mode-switch-thumb-right' : ''}`} />
                </button>
                <span className="ra-mode-switch-label">Auto</span>
              </div>
              {allocationMode === 'manual' && (
                <button
                  onClick={handleSaveRoomAllocations}
                  disabled={isSavingAllocation || rooms.length === 0 || examDates.length === 0}
                  className="ra-btn ra-btn-save"
                >
                  <svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                  {isSavingAllocation ? 'Saving...' : 'Save Allocation'}
                </button>
              )}
            </div>
          ) : null}
        </div>

        {isExmclRoute ? (
          <ExamRoomLayoutDesigner
            rooms={selectedExamRooms}
            pendingSaveCount={pendingExamRoomSaveCount}
            onSaved={() => void Promise.all([fetchRooms(), fetchAsetsCandidates()])}
          />
        ) : loadingExamDates ? (
          <div className="ra-msg">
            <svg className="ra-spin" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Loading exam dates...
          </div>
        ) : examDates.length === 0 ? (
          <div className="ra-msg">
            <svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
            No centre datesheet dates found. Import/generate centre datesheet to enable allocation columns.
          </div>
        ) : (
          <div className="ra-table-wrap" ref={allocTableWrapRef}>
            <table className="ra-alloc-table">
              <thead>
                <tr>
                  <th className="ra-text-left">Sr No</th>
                  <th className="ra-text-left">Room No</th>
                  <th className="ra-text-left">Name</th>
                  {examDates.map((dateKey) => (
                    <th key={dateKey} data-date={dateKey}>{formatDateLabel(dateKey)}</th>
                  ))}
                </tr>
                <tr className="ra-required-row">
                  <th colSpan={3} className="ra-text-left">Rooms Required</th>
                  {examDates.map((dateKey) => {
                    const required = Number(requiredRoomsByDate[dateKey] || 0)
                    const allocated = getAllocatedRoomsCountForDate(dateKey)
                    const statusClass = required <= 0
                      ? 'ra-required-none'
                      : allocated >= required
                        ? 'ra-required-complete'
                        : 'ra-required-pending'

                    return (
                      <th key={`required-${dateKey}`} className={`ra-required-cell ${statusClass}`}>
                        {allocated}/{required}
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {rooms.map((room, index) => (
                  <tr key={`allocation-${room._id}`}>
                    <td><span className="ra-sr">{index + 1}</span></td>
                    <td><span className="ra-room-no">{room.roomNo}</span></td>
                    <td><span className="ra-room-name">{room.roomName || `Room ${room.roomNo}`}</span></td>
                    {examDates.map((dateKey) => (
                      <td key={`${room._id}-${dateKey}`}>
                        <div className="ra-alloc-cell">
                          <input
                            type="checkbox"
                            checked={isRoomSelectedForDate(room._id, dateKey)}
                            onChange={() => toggleRoomDateAllocation(room._id, dateKey)}
                            disabled={!canToggleRoomDateAllocation(room._id, dateKey)}
                            title={`${room.roomNo} - ${formatDateLabel(dateKey)}${allocationMode === 'manual' ? '' : ' (disabled in auto mode)'}`}
                          />
                          {getSelectionOrder(room._id, dateKey) !== null && (
                            <span className="ra-alloc-order">
                              #{getSelectionOrder(room._id, dateKey)}
                            </span>
                          )}
                          {(() => {
                            const order = getSelectionOrder(room._id, dateKey)
                            const shared = sharedPositionsByDate[dateKey]
                            const isShared = order !== null && shared && shared.has(order)
                            return isShared ? <span className="ra-shared-tag">Shared</span> : null
                          })()}
                        </div>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

export default RoomAllocation
