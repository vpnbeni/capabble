import React, { useState, useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Armchair, Building2, CalendarDays, CalendarX2, DoorOpen, Pencil, Plus, RefreshCw, Save, Trash2 } from 'lucide-react'
import { seatingPlanService, Room, type AsetsExamRoomCandidate } from '../services/seatingPlanService'
import centreDatesheetService, { type CentreDatesheetEntry } from '../services/centreDatesheetService'
import { sidebarKeys } from '../hooks/useSidebarCounts'
import ExamRoomLayoutDesigner from '../components/exmcl/ExamRoomLayoutDesigner'
import { calculateLayoutCapacity, getRoomSeatingLayout } from '../constants/examRoomLayout'
import {
  Badge,
  BulkBar,
  Button,
  Card,
  CardToolbar,
  Checkbox,
  DataTable,
  Dialog,
  EmptyState,
  Menu,
  Page,
  Select,
  Sheet,
  StatCard,
  Switch,
  TextField,
  orDash,
  useRowSelection,
  type DataTableColumn,
} from '@/components/ui'
import { CardLoading } from '@/components/exmcl/ExmclUi'
import '@/components/exmcl/centre-rooms.css'

const FLOOR_OPTIONS = ['Ground Floor', 'First Floor', 'Second Floor', 'Third Floor']

const getRoomId = (room: Room) => room._id
const getRoomRowLabel = (room: Room) => `Select room ${room.roomNo}`

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
  const [confirmingDelete, setConfirmingDelete] = useState<Room[] | null>(null)
  const [triedSave, setTriedSave] = useState(false)
  const [savingRoom, setSavingRoom] = useState(false)
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
      // Scroll so the target column is visible, offset by the sticky room columns
      const stickyWidth = Array.from(wrap.querySelectorAll<HTMLElement>('thead tr:first-child .cx-alloc__num, thead tr:first-child .cx-alloc__room'))
        .reduce((sum, cell) => sum + cell.offsetWidth, 0)
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
      toast.error('Rooms from Assets didn’t load. Check your connection and try again.')
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
      toast.success('Exam rooms saved.')
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
        toast.error(
          `Up to ${maxRoomsRequired} rooms are needed on one day, and the centre has ${rooms.length}. Add more rooms to switch to auto.`
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

  const { selection, selectedRows, count: selectedCount, clear: clearSelection } = useRowSelection(rooms, getRoomId, {
    rowLabel: getRoomRowLabel,
  })

  const sheetOpen = isAddingNew || editingId !== null
  const sheetRoom = editingId ? editingData : newRoom
  const setSheetRoom = (patch: Partial<Room>) => {
    if (editingId) setEditingData({ ...editingData, ...patch })
    else setNewRoom({ ...newRoom, ...patch })
  }

  const openAddRoom = () => {
    setEditingId(null)
    setEditingData({})
    setTriedSave(false)
    setIsAddingNew(true)
  }

  const handleAddRoom = async () => {
    setTriedSave(true)
    if (newRoom.roomNo && newRoom.floor) {
      setSavingRoom(true)
      try {
        await seatingPlanService.createRoom(newRoom)
        await fetchRooms()
        queryClient.invalidateQueries({ queryKey: sidebarKeys.all })
        toast.success(`Room ${newRoom.roomNo} added.`)
        setNewRoom({ roomNo: '', roomName: '', floor: '' })
        setIsAddingNew(false)
      } catch (error: any) {
        console.error('Failed to add room:', error)
        const message = error?.response?.data?.message || 'The room wasn’t added. Try again.'
        toast.error(message)
      } finally {
        setSavingRoom(false)
      }
    }
  }

  const handleEditRoom = (room: Room) => {
    setIsAddingNew(false)
    setTriedSave(false)
    setEditingId(room._id)
    setEditingData(room)
  }

  const handleSaveRoom = async (id: string) => {
    setSavingRoom(true)
    try {
      await seatingPlanService.updateRoom(id, editingData)
      await fetchRooms()
      queryClient.invalidateQueries({ queryKey: sidebarKeys.all })
      toast.success(editingData.roomNo ? `Room ${editingData.roomNo} updated.` : 'Room updated.')
      setEditingId(null)
      setEditingData({})
    } catch (error: any) {
      console.error('Failed to update room:', error)
      const message = error?.response?.data?.message || 'The room wasn’t updated. Try again.'
      toast.error(message)
    } finally {
      setSavingRoom(false)
    }
  }

  const handleDeleteRooms = async () => {
    if (!confirmingDelete || confirmingDelete.length === 0) return
    setIsDeleting(true)
    const ids = confirmingDelete.map((room) => room._id)
    try {
      await Promise.all(ids.map((id) => seatingPlanService.deleteRoom(id)))
      toast.success(ids.length === 1 ? 'Room deleted.' : `${ids.length} rooms deleted.`)
      clearSelection()
      setConfirmingDelete(null)
      await fetchRooms()
      queryClient.invalidateQueries({ queryKey: sidebarKeys.all })
    } catch (error) {
      console.error('Failed to delete rooms:', error)
      toast.error('Some rooms weren’t deleted. Try again.')
    } finally {
      setIsDeleting(false)
    }
  }

  const handleCancelEdit = () => {
    setEditingId(null)
    setEditingData({})
    setIsAddingNew(false)
    setNewRoom({ roomNo: '', roomName: '', floor: '' })
  }

  const maxRoomsRequired = examDates.reduce((max, dateKey) => Math.max(max, Number(requiredRoomsByDate[dateKey] || 0)), 0)

  const roomColumns: DataTableColumn<Room>[] = [
    { key: 'order', header: '#', width: 48, numeric: true, mobile: 'hidden', render: (room) => rooms.indexOf(room) + 1 },
    { key: 'roomNo', header: 'Room no.', mobile: 'title', render: (room) => <span className="cb-strong">{room.roomNo}</span> },
    { key: 'roomName', header: 'Room name', mobile: 'subtitle', render: (room) => orDash(room.roomName) },
    { key: 'floor', header: 'Floor', render: (room) => orDash(room.floor) },
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
            { label: 'Edit room', icon: Pencil, onSelect: () => handleEditRoom(room) },
            { divider: true },
            { label: 'Delete room', icon: Trash2, tone: 'danger', onSelect: () => setConfirmingDelete([room]) },
          ]}
        />
      ),
    },
  ]

  const asetsColumns: DataTableColumn<AsetsExamRoomCandidate>[] = [
    {
      key: 'use',
      header: 'Use',
      headerLabel: 'Use for exams',
      width: 56,
      interactive: true,
      mobile: 'aside',
      render: (candidate) => (
        <Checkbox
          checked={examLocationSelection.has(candidate.locationId)}
          onChange={() => toggleExamLocation(candidate.locationId)}
          aria-label={`Use ${candidate.name} for exams`}
        />
      ),
    },
    {
      key: 'order',
      header: '#',
      width: 48,
      numeric: true,
      mobile: 'hidden',
      render: (candidate) => sortedAsetsCandidates.indexOf(candidate) + 1,
    },
    {
      key: 'roomNumber',
      header: 'Room no.',
      mobile: 'title',
      render: (candidate) => <span className="cb-strong">{orDash(candidate.roomNumber)}</span>,
    },
    { key: 'name', header: 'Room name', mobile: 'subtitle', render: (candidate) => candidate.name },
    { key: 'classSection', header: 'Class and section', render: (candidate) => orDash(candidate.classSection) },
    { key: 'floor', header: 'Floor', render: (candidate) => orDash(candidate.floor) },
    {
      key: 'status',
      header: 'Status',
      render: (candidate) => {
        const ticked = examLocationSelection.has(candidate.locationId)
        if (ticked !== Boolean(candidate.useForExams)) return <Badge tone="warning">Not saved</Badge>
        return ticked ? <Badge tone="success">Exam room</Badge> : <Badge tone="neutral">Not used</Badge>
      },
    },
  ]

  return (
    <Page>
      <section className="cb-stats" aria-label="Exam room totals">
        {isExmclRoute ? (
          <>
            <StatCard label="Rooms in Assets" value={loadingAsets ? '…' : asetsCandidates.length} icon={Building2} hint="From Assets locations" />
            <StatCard label="Used for exams" value={examLocationSelection.size} icon={DoorOpen} hint="Ticked below" />
            <StatCard label="Seats" value={loading ? '…' : totalExamRoomCapacity} icon={Armchair} hint="Across saved exam rooms" />
          </>
        ) : (
          <>
            <StatCard label="Exam rooms" value={loading ? '…' : rooms.length} icon={DoorOpen} hint="At this centre" />
            <StatCard label="Exam dates" value={loadingExamDates ? '…' : examDates.length} icon={CalendarDays} hint="From the centre datesheet" />
            <StatCard
              label="Most rooms needed"
              value={loadingExamDates ? '…' : maxRoomsRequired}
              icon={Building2}
              hint="On the busiest exam day"
            />
          </>
        )}
      </section>

      {isExmclRoute ? (
        <Card
          flush
          title="Exam rooms"
          subtitle="Rooms come from Assets locations. Tick the ones to use for exams, then save."
          action={
            <div className="cb-card-actions">
              <Button icon={RefreshCw} onClick={() => void fetchAsetsCandidates()} disabled={loadingAsets}>
                Refresh from Assets
              </Button>
              <Button
                variant="primary"
                icon={Save}
                onClick={handleSaveExamRoomSelection}
                loading={savingExamSelection}
                disabled={loadingAsets}
              >
                Save exam rooms
              </Button>
            </div>
          }
        >
          <DataTable
            caption="Rooms from Assets locations"
            columns={asetsColumns}
            rows={sortedAsetsCandidates}
            getRowKey={(candidate) => candidate.locationId}
            onRowClick={(candidate) => toggleExamLocation(candidate.locationId)}
            loading={loadingAsets}
            loadingLabel="Loading rooms from Assets locations…"
            empty={
              <EmptyState
                icon={Building2}
                title="No rooms in Assets yet"
                body="Add rooms under Assets → Locations, then come back here to pick the exam rooms."
              />
            }
          />
        </Card>
      ) : (
        <Card
          flush
          title="Exam rooms"
          subtitle="Rooms candidates sit in. Seating plans and the date-wise allocation use this list."
          action={
            <Button variant="primary" icon={Plus} onClick={openAddRoom} disabled={isAddingNew}>
              Add room
            </Button>
          }
        >
          {selectedCount > 0 ? (
            <CardToolbar>
              <BulkBar count={selectedCount} noun="room" onClear={clearSelection} busy={isDeleting}>
                <Button size="sm" variant="danger" icon={Trash2} onClick={() => setConfirmingDelete(selectedRows)} disabled={isDeleting}>
                  Delete
                </Button>
              </BulkBar>
            </CardToolbar>
          ) : null}
          <DataTable
            caption="Exam rooms"
            columns={roomColumns}
            rows={rooms}
            getRowKey={getRoomId}
            onRowClick={handleEditRoom}
            selection={selection}
            loading={loading}
            loadingLabel="Loading rooms…"
            empty={
              <EmptyState
                icon={DoorOpen}
                title="No exam rooms yet"
                body="Add the rooms candidates will sit in. Seating plans and the date-wise allocation are built from this list."
                action={
                  <Button size="sm" icon={Plus} onClick={openAddRoom}>
                    Add room
                  </Button>
                }
              />
            }
          />
        </Card>
      )}

      {isExmclRoute ? (
        <ExamRoomLayoutDesigner
          rooms={selectedExamRooms}
          pendingSaveCount={pendingExamRoomSaveCount}
          onSaved={() => void Promise.all([fetchRooms(), fetchAsetsCandidates()])}
        />
      ) : (
        <Card
          flush
          title="Room allocation by date"
          subtitle={
            allocationMode === 'auto'
              ? 'Auto: rooms are picked for each date by the allocation guidelines.'
              : 'Manual: tick rooms for each date. The order you tick them in sets which room fills first.'
          }
          action={
            <div className="cb-card-actions">
              <Switch
                label="Auto allocation"
                checked={allocationMode === 'auto'}
                disabled={loadingAllocationMode}
                onChange={(checked) => void handleModeChange(checked ? 'auto' : 'manual')}
              />
              {allocationMode === 'manual' ? (
                <Button
                  variant="primary"
                  icon={Save}
                  onClick={handleSaveRoomAllocations}
                  loading={isSavingAllocation}
                  disabled={rooms.length === 0 || examDates.length === 0}
                >
                  Save allocation
                </Button>
              ) : null}
            </div>
          }
        >
          {loadingExamDates ? (
            <CardLoading label="Loading exam dates…" />
          ) : examDates.length === 0 ? (
            <EmptyState
              icon={CalendarX2}
              title="No exam dates yet"
              body="Import or generate the centre datesheet. Each exam date then gets a column here."
            />
          ) : (
            <div className="cx-alloc" ref={allocTableWrapRef}>
              <table>
                <caption className="cb-visually-hidden">Rooms allocated to each exam date</caption>
                <thead>
                  <tr>
                    <th scope="col" className="cx-alloc__num">#</th>
                    <th scope="col" className="cx-alloc__room">Room</th>
                    {examDates.map((dateKey) => (
                      <th key={dateKey} scope="col" data-date={dateKey}>{formatDateLabel(dateKey)}</th>
                    ))}
                  </tr>
                  <tr className="cx-alloc__need">
                    <th className="cx-alloc__num" aria-hidden="true" />
                    <th scope="row" className="cx-alloc__room">Picked of needed</th>
                    {examDates.map((dateKey) => {
                      const required = Number(requiredRoomsByDate[dateKey] || 0)
                      const allocated = getAllocatedRoomsCountForDate(dateKey)
                      const tone = required <= 0 ? 'neutral' : allocated >= required ? 'success' : 'warning'
                      const title = required <= 0
                        ? 'No rooms needed on this date'
                        : allocated >= required
                          ? 'Every room needed is picked'
                          : `${required - allocated} more room(s) needed`

                      return (
                        <th key={`required-${dateKey}`}>
                          <Badge tone={tone} title={title}>
                            {allocated}/{required}
                          </Badge>
                        </th>
                      )
                    })}
                  </tr>
                </thead>
                <tbody>
                  {rooms.map((room, index) => (
                    <tr key={`allocation-${room._id}`}>
                      <td className="cx-alloc__num">{index + 1}</td>
                      <th scope="row" className="cx-alloc__room">
                        <span className="cx-alloc__room-no">{room.roomNo}</span>
                        <span className="cx-alloc__room-name">{room.roomName || `Room ${room.roomNo}`}</span>
                      </th>
                      {examDates.map((dateKey) => {
                        const order = getSelectionOrder(room._id, dateKey)
                        const shared = sharedPositionsByDate[dateKey]
                        const isShared = order !== null && shared && shared.has(order)
                        return (
                          <td key={`${room._id}-${dateKey}`}>
                            <span
                              className="cx-alloc__cell"
                              title={`${room.roomNo} – ${formatDateLabel(dateKey)}${allocationMode === 'manual' ? '' : ' (switch to manual to change)'}`}
                            >
                              <Checkbox
                                checked={isRoomSelectedForDate(room._id, dateKey)}
                                onChange={() => toggleRoomDateAllocation(room._id, dateKey)}
                                disabled={!canToggleRoomDateAllocation(room._id, dateKey)}
                                aria-label={`Room ${room.roomNo} on ${formatDateLabel(dateKey)}`}
                              />
                              {order !== null ? <span className="cx-alloc__order">#{order}</span> : null}
                              {isShared ? <Badge tone="neutral" dot={false}>Shared</Badge> : null}
                            </span>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      <Sheet
        open={sheetOpen}
        onClose={handleCancelEdit}
        icon={DoorOpen}
        title={editingId ? `Edit room ${rooms.find((room) => room._id === editingId)?.roomNo || ''}`.trim() : 'Add room'}
        description="Room number, name and floor."
        onSubmit={(event) => {
          event.preventDefault()
          if (savingRoom) return
          if (editingId) void handleSaveRoom(editingId)
          else void handleAddRoom()
        }}
        footer={
          <>
            <Button onClick={handleCancelEdit} disabled={savingRoom}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={savingRoom}>
              {editingId ? 'Save room' : 'Add room'}
            </Button>
          </>
        }
      >
        <div className="cb-form-grid">
          <TextField
            label="Room number"
            required={!editingId}
            autoFocus
            placeholder="e.g. 101"
            value={sheetRoom.roomNo || ''}
            onChange={(e) => setSheetRoom({ roomNo: e.target.value })}
            error={!editingId && triedSave && !newRoom.roomNo ? 'Enter the room number.' : undefined}
          />
          <Select
            label="Floor"
            required={!editingId}
            placeholder={editingId ? undefined : 'Select floor'}
            value={sheetRoom.floor || ''}
            onChange={(e) => setSheetRoom({ floor: e.target.value })}
            options={FLOOR_OPTIONS}
            error={!editingId && triedSave && !newRoom.floor ? 'Pick the floor.' : undefined}
          />
          <TextField
            className="is-wide"
            label="Room name"
            placeholder="e.g. Science block hall"
            value={sheetRoom.roomName || ''}
            onChange={(e) => setSheetRoom({ roomName: e.target.value })}
          />
        </div>
      </Sheet>

      <Dialog
        open={Boolean(confirmingDelete)}
        onClose={() => (isDeleting ? undefined : setConfirmingDelete(null))}
        tone="danger"
        size="sm"
        title={
          confirmingDelete?.length === 1
            ? `Delete room ${confirmingDelete[0].roomNo}?`
            : `Delete ${confirmingDelete?.length || 0} rooms?`
        }
        description="The rooms leave this centre’s list and its date-wise allocation. This can’t be undone."
        footer={
          <>
            <Button onClick={() => setConfirmingDelete(null)} disabled={isDeleting}>
              Keep rooms
            </Button>
            <Button variant="danger" loading={isDeleting} onClick={() => void handleDeleteRooms()}>
              Delete
            </Button>
          </>
        }
      />
    </Page>
  )
}

export default RoomAllocation
