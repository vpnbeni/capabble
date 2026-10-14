import React, { useEffect, useMemo, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { LayoutGrid, Pencil, Plus, Save, Trash2 } from 'lucide-react'
import { useTimetable, type TimetableClass } from '@/contexts/TimetableContext'
import { getSectionDisplayName } from '@/constants/sectionMetadata'
import { sectionLabel } from '@/components/students/studentFormat'
import {
  Badge,
  Button,
  Card,
  Checkbox,
  DataTable,
  Dialog,
  EmptyState,
  Menu,
  Page,
  Select,
  Sheet,
  TextField,
  type DataTableColumn,
} from '@/components/ui'
import '@/components/timetable/classes.css'

const FLOOR_OPTIONS = ['Ground Floor', 'First Floor', 'Second Floor', 'Third Floor']

/** Subjects shown in a row before the rest fold into "+N more". */
const VISIBLE_SUBJECTS = 3

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`

const EMPTY_FORM = {
  className: '',
  section: '',
  floor: '',
  subjects: [] as string[],
  incharge: '',
  classGroup: '',
  displayOrder: 0,
}

interface MatrixClassRow {
  id: string
  name: string
}

interface MatrixSectionColumn {
  id: string
  name: string
}

interface MatrixSavePlan {
  normalizedMatrixClasses: MatrixClassRow[]
  normalizedMatrixSections: MatrixSectionColumn[]
  normalizedMatrixSelection: Record<string, Record<string, boolean>>
  desiredCombos: Array<{ className: string, section: string }>
  existingByKey: Map<string, TimetableClass>
  idsToDelete: string[]
}

let matrixSeq = 0
const genMatrixId = (prefix: string) => `${prefix}-${++matrixSeq}-${Date.now()}`
const comboKey = (className: string, section: string) => `${className.trim().toLowerCase()}::${section.trim().toLowerCase()}`
const inputSizeFor = (value: string, fallback: string, min: number) =>
  Math.max(min, (value.trim() ? value : fallback).length)

const TimetableClasses: React.FC = () => {
  const {
    isHydrated,
    classes,
    addClass,
    updateClass,
    deleteClasses,
    clearClasses,
    subjects: allSubjects,
    matrixClasses: savedMatrixClasses,
    matrixSections: savedMatrixSections,
    matrixSelection: savedMatrixSelection,
    setMatrixState,
    teachers,
  } = useTimetable()

  // Subject dropdown is strictly sourced from Timetable > Subjects module.
  const subjectNameMap = useMemo(() => {
    const map = new Map<string, string>()
    allSubjects.forEach((subject) => {
      const trimmed = subject.name.trim()
      if (!trimmed) return
      const key = trimmed.toLowerCase()
      if (!map.has(key)) {
        map.set(key, trimmed)
      }
    })
    return map
  }, [allSubjects])

  const subjectOptions = useMemo(() => {
    return Array.from(subjectNameMap.values()).sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: 'base' })
    )
  }, [subjectNameMap])

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingData, setEditingData] = useState({ ...EMPTY_FORM })
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [selectedMatrixClassIds, setSelectedMatrixClassIds] = useState<Set<string>>(new Set())
  const [matrixClasses, setMatrixClasses] = useState<MatrixClassRow[]>([])
  const [matrixSections, setMatrixSections] = useState<MatrixSectionColumn[]>([])
  const [matrixSelection, setMatrixSelection] = useState<Record<string, Record<string, boolean>>>({})
  const [matrixClassDrafts, setMatrixClassDrafts] = useState<Record<string, string>>({})
  const [matrixSectionDrafts, setMatrixSectionDrafts] = useState<Record<string, string>>({})
  const [matrixDirty, setMatrixDirty] = useState(false)
  const didHydrateLocalMatrixRef = useRef(false)
  // Confirmations that used to be window.confirm now go through kit Dialogs.
  const [confirmDeleteAllOpen, setConfirmDeleteAllOpen] = useState(false)
  const [confirmDeleteMatrixClassesOpen, setConfirmDeleteMatrixClassesOpen] = useState(false)
  const [pendingMatrixSave, setPendingMatrixSave] = useState<MatrixSavePlan | null>(null)

  // Incharge dropdown is sourced from Timetable > Teachers module.
  const teacherOptions = useMemo(() => {
    const canonicalByKey = new Map<string, string>()
    teachers.forEach((teacher) => {
      const trimmed = teacher.name.trim()
      if (!trimmed) return
      const key = trimmed.toLowerCase()
      if (!canonicalByKey.has(key)) {
        canonicalByKey.set(key, trimmed)
      }
    })
    return Array.from(canonicalByKey.values()).sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: 'base' })
    )
  }, [teachers])

  const assignedInchargeKeys = useMemo(() => {
    const keys = new Set<string>()
    classes.forEach((item) => {
      if (editingId && item.id === editingId) return
      const key = item.incharge.trim().toLowerCase()
      if (!key) return
      keys.add(key)
    })
    return keys
  }, [classes, editingId])

  const normalizeSelectedSubjects = (selected: string[]) => {
    const deduped: string[] = []
    const seen = new Set<string>()

    selected.forEach((subjectName) => {
      const key = subjectName.trim().toLowerCase()
      if (!key) return
      const canonical = subjectNameMap.get(key)
      if (!canonical) return
      const canonicalKey = canonical.toLowerCase()
      if (seen.has(canonicalKey)) return
      seen.add(canonicalKey)
      deduped.push(canonical)
    })

    return deduped
  }

  // ── CRUD ──
  const handleEdit = (item: TimetableClass) => {
    setEditingId(item.id)
    setEditingData({
      className: item.className,
      section: item.section,
      floor: item.floor,
      subjects: normalizeSelectedSubjects(item.subjects),
      incharge: item.incharge,
      classGroup: item.classGroup,
      displayOrder: item.displayOrder,
    })
  }

  const handleSave = (id: string) => {
    updateClass(id, {
      ...editingData,
      subjects: normalizeSelectedSubjects(editingData.subjects),
    })
    setEditingId(null)
    setEditingData({ ...EMPTY_FORM })
  }

  const handleCancelEdit = () => {
    setEditingId(null)
    setEditingData({ ...EMPTY_FORM })
  }

  // ── Selection ──
  const toggleSelection = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAllOnPage = () => {
    const ids = classes.map((c) => c.id)
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

  /** Opens the "Delete all" confirmation (was window.confirm). */
  const requestDeleteSelected = () => {
    const idsToDelete = classes.map((item) => item.id)

    if (idsToDelete.length === 0) return

    setConfirmDeleteAllOpen(true)
  }

  const handleDeleteSelected = () => {
    setConfirmDeleteAllOpen(false)
    const idsToDelete = classes.map((item) => item.id)

    if (idsToDelete.length === 0) return

    // Keep delete robust even if matrix metadata is inconsistent.
    try {
      if (matrixClasses.length > 0 && matrixSections.length > 0) {
        const nextMatrixSelection: Record<string, Record<string, boolean>> = {}
        matrixClasses.forEach((classItem) => {
          nextMatrixSelection[classItem.id] = matrixSections.reduce<Record<string, boolean>>((acc, sectionItem) => {
            acc[sectionItem.id] = false
            return acc
          }, {})
        })
        setMatrixSelection(nextMatrixSelection)
        setMatrixState({
          matrixClasses,
          matrixSections,
          matrixSelection: nextMatrixSelection,
        })
        setMatrixDirty(false)
      }
    } catch (error) {
      console.error('Failed to sync matrix state during class deletion:', error)
    }

    clearClasses()
    setSelectedIds(new Set())
  }

  const allOnPageSelected = classes.length > 0 && classes.every((c) => selectedIds.has(c.id))
  const someOnPageSelected = classes.some((c) => selectedIds.has(c.id))

  useEffect(() => {
    setMatrixClassDrafts((prev) => {
      const next: Record<string, string> = {}
      matrixClasses.forEach((item) => {
        next[item.id] = prev[item.id] ?? item.name
      })
      return next
    })
  }, [matrixClasses])

  useEffect(() => {
    setMatrixSectionDrafts((prev) => {
      const next: Record<string, string> = {}
      matrixSections.forEach((item) => {
        next[item.id] = prev[item.id] ?? item.name
      })
      return next
    })
  }, [matrixSections])

  // ── Stats ──
  const totalSections = classes.length
  const uniqueClasses = new Set(classes.map((c) => c.className)).size

  const hasPersistedMatrix =
    savedMatrixClasses.length > 0 ||
    savedMatrixSections.length > 0 ||
    Object.keys(savedMatrixSelection).length > 0

  useEffect(() => {
    if (!isHydrated || didHydrateLocalMatrixRef.current) return
    didHydrateLocalMatrixRef.current = true

    if (hasPersistedMatrix) {
      setMatrixClasses(savedMatrixClasses)
      setMatrixSections(savedMatrixSections)
      setMatrixSelection(savedMatrixSelection)
      setMatrixDirty(false)
      return
    }

    if (classes.length === 0) return

    const classNames = Array.from(
      new Set(
        classes
          .map((item) => item.className.trim())
          .filter(Boolean)
      )
    ).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))

    const sectionNames = Array.from(
      new Set(
        classes
          .map((item) => item.section.trim())
          .filter(Boolean)
      )
    ).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))

    const nextMatrixClasses: MatrixClassRow[] = classNames.map((name) => ({ id: genMatrixId('tmc'), name }))
    const nextMatrixSections: MatrixSectionColumn[] = sectionNames.map((name) => ({ id: genMatrixId('tms'), name }))
    const classIdByName = new Map(nextMatrixClasses.map((item) => [item.name, item.id]))
    const sectionIdByName = new Map(nextMatrixSections.map((item) => [item.name, item.id]))
    const nextSelection: Record<string, Record<string, boolean>> = {}

    classes.forEach((entry) => {
      const classId = classIdByName.get(entry.className.trim())
      const sectionId = sectionIdByName.get(entry.section.trim())
      if (!classId || !sectionId) return
      if (!nextSelection[classId]) nextSelection[classId] = {}
      nextSelection[classId][sectionId] = true
    })

    setMatrixClasses(nextMatrixClasses)
    setMatrixSections(nextMatrixSections)
    setMatrixSelection(nextSelection)
    setMatrixDirty(true)
  }, [isHydrated, hasPersistedMatrix, savedMatrixClasses, savedMatrixSections, savedMatrixSelection, classes])

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!matrixDirty) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [matrixDirty])

  const allMatrixClassesSelected =
    matrixClasses.length > 0 && matrixClasses.every((item) => selectedMatrixClassIds.has(item.id))
  const someMatrixClassesSelected = matrixClasses.some((item) => selectedMatrixClassIds.has(item.id))

  const toggleMatrixClassSelection = (classId: string) => {
    setSelectedMatrixClassIds((prev) => {
      const next = new Set(prev)
      if (next.has(classId)) next.delete(classId)
      else next.add(classId)
      return next
    })
  }

  const toggleAllMatrixClasses = () => {
    if (allMatrixClassesSelected) {
      setSelectedMatrixClassIds(new Set())
      return
    }
    setSelectedMatrixClassIds(new Set(matrixClasses.map((item) => item.id)))
  }

  /** Opens the matrix bulk-delete confirmation (was window.confirm). */
  const requestDeleteSelectedMatrixClasses = () => {
    if (selectedMatrixClassIds.size === 0) return

    const selectedRows = matrixClasses.filter((item) => selectedMatrixClassIds.has(item.id))
    if (selectedRows.length === 0) return

    setConfirmDeleteMatrixClassesOpen(true)
  }

  const handleDeleteSelectedMatrixClasses = () => {
    setConfirmDeleteMatrixClassesOpen(false)
    if (selectedMatrixClassIds.size === 0) return

    const selectedRows = matrixClasses.filter((item) => selectedMatrixClassIds.has(item.id))
    if (selectedRows.length === 0) return

    const deletedNameKeys = new Set(
      selectedRows
        .map((item) => {
          const draftedName = matrixClassDrafts[item.id]
          const name = (typeof draftedName === 'string' && draftedName.trim() ? draftedName : item.name).trim()
          return name.toLowerCase()
        })
        .filter(Boolean)
    )

    const nextMatrixClasses = matrixClasses.filter((item) => !selectedMatrixClassIds.has(item.id))
    const nextMatrixSelection = { ...matrixSelection }
    selectedMatrixClassIds.forEach((classId) => {
      delete nextMatrixSelection[classId]
    })

    setMatrixClasses(nextMatrixClasses)
    setMatrixSelection(nextMatrixSelection)
    setMatrixState({
      matrixClasses: nextMatrixClasses,
      matrixSections,
      matrixSelection: nextMatrixSelection,
    })
    setMatrixDirty(false)
    setSelectedMatrixClassIds(new Set())
    setMatrixClassDrafts((prev) => {
      const next = { ...prev }
      selectedRows.forEach((item) => {
        delete next[item.id]
      })
      return next
    })

    const comboIdsToDelete = classes
      .filter((item) => deletedNameKeys.has(item.className.trim().toLowerCase()))
      .map((item) => item.id)
    if (comboIdsToDelete.length > 0) {
      deleteClasses(comboIdsToDelete)
    }
  }

  const handleAddMatrixClass = () => {
    const classId = genMatrixId('tmc')
    const nextMatrixClasses = [...matrixClasses, { id: classId, name: '' }]
    const nextMatrixSelection = {
      ...matrixSelection,
      [classId]: matrixSections.reduce<Record<string, boolean>>((acc, section) => {
        acc[section.id] = false
        return acc
      }, {}),
    }

    setMatrixClasses(nextMatrixClasses)
    setMatrixSelection(nextMatrixSelection)
    setMatrixDirty(true)
  }

  const handleAddMatrixSection = () => {
    const sectionId = genMatrixId('tms')
    const nextMatrixSections = [...matrixSections, { id: sectionId, name: '' }]
    const nextMatrixSelection = { ...matrixSelection }

    matrixClasses.forEach((item) => {
      nextMatrixSelection[item.id] = { ...(nextMatrixSelection[item.id] || {}), [sectionId]: false }
    })

    setMatrixSections(nextMatrixSections)
    setMatrixSelection(nextMatrixSelection)
    setMatrixDirty(true)
  }

  const handleMatrixClassNameChange = (classId: string, name: string) => {
    const nextMatrixClasses = matrixClasses.map((item) => (item.id === classId ? { ...item, name } : item))
    setMatrixClasses(nextMatrixClasses)
    setMatrixDirty(true)
  }

  const handleMatrixSectionNameChange = (sectionId: string, name: string) => {
    const nextMatrixSections = matrixSections.map((item) => (item.id === sectionId ? { ...item, name } : item))
    setMatrixSections(nextMatrixSections)
    setMatrixDirty(true)
  }

  const commitMatrixClassName = (classId: string) => {
    const currentName = matrixClasses.find((item) => item.id === classId)?.name ?? ''
    const draftName = matrixClassDrafts[classId] ?? currentName
    if (draftName === currentName) return
    handleMatrixClassNameChange(classId, draftName)
  }

  const commitMatrixSectionName = (sectionId: string) => {
    const currentName = matrixSections.find((item) => item.id === sectionId)?.name ?? ''
    const draftName = matrixSectionDrafts[sectionId] ?? currentName
    if (draftName === currentName) return
    handleMatrixSectionNameChange(sectionId, draftName)
  }

  const toggleMatrixSelection = (classId: string, sectionId: string) => {
    const nextMatrixSelection = {
      ...matrixSelection,
      [classId]: {
        ...(matrixSelection[classId] || {}),
        [sectionId]: !matrixSelection[classId]?.[sectionId],
      },
    }
    setMatrixSelection(nextMatrixSelection)
    setMatrixDirty(true)
  }

  const handleSaveMatrixToLowerTable = () => {
    const normalizedMatrixClasses = matrixClasses.map((item) => ({
      ...item,
      name: (matrixClassDrafts[item.id] ?? item.name).trim(),
    }))
    const normalizedMatrixSections = matrixSections.map((item) => ({
      ...item,
      name: (matrixSectionDrafts[item.id] ?? item.name).trim(),
    }))

    if (normalizedMatrixClasses.some((item) => !item.name)) {
      toast.error('Give every class row a name before saving the matrix.')
      return
    }
    if (normalizedMatrixSections.some((item) => !item.name)) {
      toast.error('Give every section column a name before saving the matrix.')
      return
    }

    const classNameSet = new Set(normalizedMatrixClasses.map((item) => item.name.toLowerCase()))
    if (classNameSet.size !== normalizedMatrixClasses.length) {
      toast.error('Two class rows have the same name. Rename or delete one, then save.')
      return
    }

    const sectionNameSet = new Set(normalizedMatrixSections.map((item) => item.name.toLowerCase()))
    if (sectionNameSet.size !== normalizedMatrixSections.length) {
      toast.error('Two section columns have the same name. Rename one, then save.')
      return
    }

    const normalizedMatrixSelection: Record<string, Record<string, boolean>> = {}
    normalizedMatrixClasses.forEach((classItem) => {
      normalizedMatrixSelection[classItem.id] = normalizedMatrixSections.reduce<Record<string, boolean>>((acc, sectionItem) => {
        acc[sectionItem.id] = Boolean(matrixSelection[classItem.id]?.[sectionItem.id])
        return acc
      }, {})
    })

    const desiredCombos: Array<{ className: string, section: string }> = []
    normalizedMatrixClasses.forEach((classItem) => {
      normalizedMatrixSections.forEach((sectionItem) => {
        if (normalizedMatrixSelection[classItem.id]?.[sectionItem.id]) {
          desiredCombos.push({
            className: classItem.name,
            section: sectionItem.name,
          })
        }
      })
    })

    const desiredKeys = new Set(desiredCombos.map((item) => comboKey(item.className, item.section)))
    const existingByKey = new Map<string, TimetableClass>()
    classes.forEach((item) => existingByKey.set(comboKey(item.className, item.section), item))

    const idsToDelete = classes
      .filter((item) => !desiredKeys.has(comboKey(item.className, item.section)))
      .map((item) => item.id)

    const plan: MatrixSavePlan = {
      normalizedMatrixClasses,
      normalizedMatrixSections,
      normalizedMatrixSelection,
      desiredCombos,
      existingByKey,
      idsToDelete,
    }

    // Removing existing class sections needs a confirmation (was window.confirm).
    if (idsToDelete.length > 0) {
      setPendingMatrixSave(plan)
      return
    }

    commitMatrixSave(plan)
  }

  const commitMatrixSave = ({
    normalizedMatrixClasses,
    normalizedMatrixSections,
    normalizedMatrixSelection,
    desiredCombos,
    existingByKey,
    idsToDelete,
  }: MatrixSavePlan) => {
    setPendingMatrixSave(null)
    setMatrixClasses(normalizedMatrixClasses)
    setMatrixSections(normalizedMatrixSections)
    setMatrixSelection(normalizedMatrixSelection)
    setMatrixClassDrafts(Object.fromEntries(normalizedMatrixClasses.map((item) => [item.id, item.name])))
    setMatrixSectionDrafts(Object.fromEntries(normalizedMatrixSections.map((item) => [item.id, item.name])))
    setMatrixState({
      matrixClasses: normalizedMatrixClasses,
      matrixSections: normalizedMatrixSections,
      matrixSelection: normalizedMatrixSelection,
    })
    setMatrixDirty(false)

    const combosToAdd = desiredCombos.filter((item) => !existingByKey.has(comboKey(item.className, item.section)))

    if (idsToDelete.length > 0) {
      deleteClasses(idsToDelete)
    }

    combosToAdd.forEach((item) => {
      const sample = classes.find((entry) => entry.className.trim().toLowerCase() === item.className.toLowerCase())
      addClass({
        className: item.className,
        section: item.section,
        floor: sample?.floor || 'First Floor',
        subjects: normalizeSelectedSubjects(sample?.subjects || []),
        incharge: sample?.incharge || '',
        classGroup: sample?.classGroup || '',
        displayOrder: sample?.displayOrder ?? 0,
      })
    })

    toast.success('Matrix saved. The class list is up to date.')
  }

  // ── Subject multi-select helpers ──
  const toggleSubject = (
    subjects: string[],
    subject: string,
    setter: (subjects: string[]) => void
  ) => {
    if (subjects.includes(subject)) {
      setter(subjects.filter((s) => s !== subject))
    } else {
      setter([...subjects, subject])
    }
  }

  // ── View helpers ──
  const selectedMatrixCount = selectedMatrixClassIds.size
  const matrixClassLabel = (row: MatrixClassRow, index: number) =>
    (matrixClassDrafts[row.id] ?? row.name).trim() || `Class ${index + 1}`
  const matrixSectionLabel = (section: MatrixSectionColumn, index: number) =>
    getSectionDisplayName(matrixSectionDrafts[section.id] ?? section.name) || `Section ${index + 1}`
  const rowLabel = (item: TimetableClass) =>
    [item.className.trim(), sectionLabel(item.section)].filter(Boolean).join(' · ') || 'class section'
  const editingItem = editingId ? classes.find((item) => item.id === editingId) : undefined
  const pendingRemovals = pendingMatrixSave
    ? classes.filter((item) => pendingMatrixSave.idsToDelete.includes(item.id))
    : []

  const columns: DataTableColumn<TimetableClass>[] = [
    {
      key: 'className',
      header: 'Class',
      mobile: 'title',
      render: (item) => <span className="cb-strong">{item.className.trim() || '—'}</span>,
    },
    {
      key: 'section',
      header: 'Section',
      mobile: 'subtitle',
      render: (item) => sectionLabel(item.section) || '—',
    },
    {
      key: 'floor',
      header: 'Floor',
      render: (item) =>
        item.floor ? (
          <Badge tone="neutral" dot={false}>
            {item.floor}
          </Badge>
        ) : (
          '—'
        ),
    },
    {
      key: 'subjects',
      header: 'Subjects',
      render: (item) => {
        const visibleSubjects = normalizeSelectedSubjects(item.subjects)
        if (visibleSubjects.length === 0) return '—'
        const shown = visibleSubjects.slice(0, VISIBLE_SUBJECTS)
        const hidden = visibleSubjects.slice(VISIBLE_SUBJECTS)
        return (
          <span className="tc-subjects">
            {shown.map((subject) => (
              <Badge key={subject} tone="neutral" dot={false}>
                {subject}
              </Badge>
            ))}
            {hidden.length > 0 ? (
              <Badge tone="neutral" dot={false} title={hidden.join(', ')}>
                +{hidden.length} more
              </Badge>
            ) : null}
          </span>
        )
      },
    },
    {
      key: 'incharge',
      header: 'Class teacher',
      render: (item) => item.incharge.trim() || '—',
    },
    {
      key: 'actions',
      header: <span className="cb-visually-hidden">Actions</span>,
      headerLabel: 'Actions',
      align: 'right',
      width: 56,
      mobile: 'aside',
      interactive: true,
      render: (item) => (
        <Menu
          label={`Actions for ${rowLabel(item)}`}
          items={[{ label: 'Edit class section', icon: Pencil, onSelect: () => handleEdit(item) }]}
        />
      ),
    },
  ]

  return (
    <Page>
      <div className="cb-stack">
        <Card
          flush
          className="tc-matrix-card"
          title="Class and section matrix"
          subtitle="Tick a box to give that class the section. Rename a class or section by typing over its name, then save the matrix to update the list below."
          action={
            <div className="tc-actions">
              {matrixDirty ? <Badge tone="warning">Unsaved changes</Badge> : null}
              <Button size="sm" icon={Plus} onClick={handleAddMatrixClass}>
                Add class
              </Button>
              <Button size="sm" icon={Plus} onClick={handleAddMatrixSection}>
                Add section
              </Button>
              <Button size="sm" variant="primary" icon={Save} onClick={handleSaveMatrixToLowerTable}>
                Save matrix
              </Button>
            </div>
          }
        >
          {selectedMatrixCount > 0 ? (
            <div className="tc-bulkbar" role="region" aria-label="Bulk actions">
              <span className="is-num">{plural(selectedMatrixCount, 'class', 'classes')} selected</span>
              <span className="tc-bulkbar__spacer" />
              <Button variant="tertiary" size="sm" onClick={() => setSelectedMatrixClassIds(new Set())}>
                Clear selection
              </Button>
              <Button size="sm" icon={Trash2} onClick={requestDeleteSelectedMatrixClasses}>
                Delete {plural(selectedMatrixCount, 'class', 'classes')}
              </Button>
            </div>
          ) : null}

          {matrixClasses.length === 0 && matrixSections.length === 0 ? (
            <EmptyState
              compact
              title="The matrix has no classes or sections yet"
              body="Add a class and a section, tick the sections each class has, then save the matrix."
            />
          ) : (
            <div className="tc-matrix-scroll">
              <table className="tc-matrix">
                <caption className="cb-visually-hidden">Class and section matrix</caption>
                <thead>
                  <tr>
                    <th scope="col" className="tc-matrix__sticky">
                      <span className="tc-matrix__classhead">
                        <Checkbox
                          checked={allMatrixClassesSelected}
                          indeterminate={someMatrixClassesSelected && !allMatrixClassesSelected}
                          onChange={() => toggleAllMatrixClasses()}
                          aria-label="Select all classes"
                        />
                        Class
                      </span>
                    </th>
                    {matrixSections.length > 0 ? (
                      matrixSections.map((section, index) => {
                        const raw = matrixSectionDrafts[section.id] ?? section.name
                        const display = getSectionDisplayName(raw)
                        return (
                          <th key={section.id} scope="col" className="tc-matrix__section">
                            <input
                              type="text"
                              value={raw}
                              placeholder={`Section ${index + 1}`}
                              size={inputSizeFor(raw, `Section ${index + 1}`, 6)}
                              aria-label={`Section ${index + 1} name`}
                              onChange={(e) => {
                                setMatrixSectionDrafts((prev) => ({ ...prev, [section.id]: e.target.value }))
                                setMatrixDirty(true)
                              }}
                              onBlur={() => commitMatrixSectionName(section.id)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault()
                                  e.currentTarget.blur()
                                }
                              }}
                              className="tc-matrix__input"
                            />
                            {display && display !== raw.trim() ? (
                              <span className="tc-matrix__hint">{display}</span>
                            ) : null}
                          </th>
                        )
                      })
                    ) : (
                      <th scope="col" className="tc-matrix__section">Sections</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {matrixClasses.length > 0 ? (
                    matrixClasses.map((row, index) => {
                      const classLabel = matrixClassLabel(row, index)
                      const isSelected = selectedMatrixClassIds.has(row.id)
                      return (
                        <tr key={row.id} className={isSelected ? 'is-selected' : undefined}>
                          <th scope="row" className="tc-matrix__sticky">
                            <span className="tc-matrix__classcell">
                              <Checkbox
                                checked={isSelected}
                                onChange={() => toggleMatrixClassSelection(row.id)}
                                aria-label={`Select ${classLabel}`}
                              />
                              <input
                                type="text"
                                value={matrixClassDrafts[row.id] ?? row.name}
                                placeholder={`Class ${index + 1}`}
                                size={inputSizeFor(matrixClassDrafts[row.id] ?? row.name, `Class ${index + 1}`, 4)}
                                aria-label={`Class ${index + 1} name`}
                                onChange={(e) => {
                                  setMatrixClassDrafts((prev) => ({ ...prev, [row.id]: e.target.value }))
                                  setMatrixDirty(true)
                                }}
                                onBlur={() => commitMatrixClassName(row.id)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault()
                                    e.currentTarget.blur()
                                  }
                                }}
                                className="tc-matrix__input"
                              />
                            </span>
                          </th>
                          {matrixSections.length > 0 ? (
                            matrixSections.map((section, sectionIndex) => (
                              <td key={section.id} className="tc-matrix__cell">
                                <Checkbox
                                  checked={Boolean(matrixSelection[row.id]?.[section.id])}
                                  onChange={() => toggleMatrixSelection(row.id, section.id)}
                                  aria-label={`${classLabel} · ${matrixSectionLabel(section, sectionIndex)}`}
                                />
                              </td>
                            ))
                          ) : (
                            <td className="tc-matrix__note">Add a section column to start ticking.</td>
                          )}
                        </tr>
                      )
                    })
                  ) : (
                    <tr>
                      <td className="tc-matrix__note" colSpan={1 + Math.max(matrixSections.length, 1)}>
                        No classes yet. Add a class to tick its sections.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card
          flush
          title="Classes and sections"
          subtitle={`${plural(uniqueClasses, 'class', 'classes')} · ${plural(totalSections, 'section', 'sections')}`}
          action={
            classes.length > 0 ? (
              <Menu
                label="More actions for classes and sections"
                items={[
                  {
                    label: 'Delete all class sections',
                    icon: Trash2,
                    tone: 'danger',
                    onSelect: requestDeleteSelected,
                  },
                ]}
              />
            ) : null
          }
        >
          <DataTable
            caption="Classes and sections"
            columns={columns}
            rows={classes}
            getRowKey={(item) => item.id}
            onRowClick={handleEdit}
            selection={{
              isSelected: (item) => selectedIds.has(item.id),
              onToggle: (item) => toggleSelection(item.id),
              allSelected: allOnPageSelected,
              someSelected: someOnPageSelected,
              onToggleAll: selectAllOnPage,
              rowLabel: (item) => `Select ${rowLabel(item)}`,
            }}
            empty={
              <EmptyState
                compact
                title="No class sections yet"
                body="Tick sections in the matrix above, then save the matrix to list them here."
              />
            }
          />
        </Card>
      </div>

      <EditClassSheet
        open={Boolean(editingId)}
        title={editingItem ? `Edit ${rowLabel(editingItem)}` : 'Edit class section'}
        data={editingData}
        subjectOptions={subjectOptions}
        teacherOptions={teacherOptions}
        blockedTeacherKeys={assignedInchargeKeys}
        onFieldChange={(field, value) => setEditingData((prev) => ({ ...prev, [field]: value }))}
        onToggleSubject={(subj) =>
          toggleSubject(editingData.subjects, subj, (subjects) =>
            setEditingData((prev) => ({ ...prev, subjects }))
          )
        }
        onSave={() => {
          if (editingId) handleSave(editingId)
        }}
        onCancel={handleCancelEdit}
      />

      <Dialog
        open={confirmDeleteMatrixClassesOpen}
        onClose={() => setConfirmDeleteMatrixClassesOpen(false)}
        tone="danger"
        size="sm"
        title={`Delete ${plural(selectedMatrixCount, 'class', 'classes')} from the matrix?`}
        description="Their class sections are removed from the list below too, including floor, subjects and class teacher. This can't be undone."
        footer={
          <>
            <Button onClick={() => setConfirmDeleteMatrixClassesOpen(false)}>Keep classes</Button>
            <Button variant="danger" icon={Trash2} onClick={handleDeleteSelectedMatrixClasses}>
              Delete {plural(selectedMatrixCount, 'class', 'classes')}
            </Button>
          </>
        }
      />

      <Dialog
        open={Boolean(pendingMatrixSave)}
        onClose={() => setPendingMatrixSave(null)}
        tone="danger"
        size="sm"
        title={`Remove ${plural(pendingMatrixSave?.idsToDelete.length ?? 0, 'class section', 'class sections')}?`}
        description="These class sections aren't ticked in the matrix, so saving removes them from the list, along with their floor, subjects and class teacher."
        footer={
          <>
            <Button onClick={() => setPendingMatrixSave(null)}>Keep editing</Button>
            <Button
              variant="danger"
              icon={Save}
              onClick={() => {
                if (pendingMatrixSave) commitMatrixSave(pendingMatrixSave)
              }}
            >
              Save and remove {pendingMatrixSave?.idsToDelete.length ?? 0}
            </Button>
          </>
        }
      >
        {pendingRemovals.length > 0 ? (
          <span className="tc-subjects">
            {pendingRemovals.map((item) => (
              <Badge key={item.id} tone="neutral" dot={false}>
                {rowLabel(item)}
              </Badge>
            ))}
          </span>
        ) : null}
      </Dialog>

      <Dialog
        open={confirmDeleteAllOpen}
        onClose={() => setConfirmDeleteAllOpen(false)}
        tone="danger"
        size="sm"
        title={`Delete all ${plural(classes.length, 'class section', 'class sections')}?`}
        description="Every class section is removed from the list and all ticks in the matrix are cleared. This can't be undone."
        footer={
          <>
            <Button onClick={() => setConfirmDeleteAllOpen(false)}>Keep class sections</Button>
            <Button variant="danger" icon={Trash2} onClick={handleDeleteSelected}>
              Delete all {classes.length}
            </Button>
          </>
        }
      />
    </Page>
  )
}

/* ═══════════════════════════════════════════════════
   Edit sheet for one class section (replaces the old inline edit row)
   ═══════════════════════════════════════════════════ */
interface EditClassSheetProps {
  open: boolean
  title: string
  data: {
    className: string
    section: string
    floor: string
    subjects: string[]
    incharge: string
  }
  subjectOptions: string[]
  teacherOptions: string[]
  blockedTeacherKeys: Set<string>
  onFieldChange: (field: string, value: string) => void
  onToggleSubject: (subject: string) => void
  onSave: () => void
  onCancel: () => void
}

const EditClassSheet: React.FC<EditClassSheetProps> = ({
  open,
  title,
  data,
  subjectOptions,
  teacherOptions,
  blockedTeacherKeys,
  onFieldChange,
  onToggleSubject,
  onSave,
  onCancel,
}) => {
  const availableTeacherOptions = useMemo(() => {
    const current = data.incharge.trim()
    const currentKey = current.toLowerCase()
    const options = teacherOptions.filter((name) => !blockedTeacherKeys.has(name.toLowerCase()))
    if (current && !options.some((name) => name.toLowerCase() === currentKey)) {
      options.unshift(current)
    }
    return options
  }, [teacherOptions, blockedTeacherKeys, data.incharge])

  return (
    <Sheet
      open={open}
      onClose={onCancel}
      icon={LayoutGrid}
      title={title}
      description="Changes apply to this class section only."
      onSubmit={(event) => {
        event.preventDefault()
        onSave()
      }}
      footer={
        <>
          <Button onClick={onCancel}>Cancel</Button>
          <Button type="submit" variant="primary">
            Save changes
          </Button>
        </>
      }
    >
      <div className="cb-form-grid">
        <TextField
          label="Class"
          value={data.className}
          onChange={(e) => onFieldChange('className', e.target.value)}
          placeholder="For example, 10"
        />
        <TextField
          label="Section"
          value={data.section}
          onChange={(e) => onFieldChange('section', e.target.value)}
          placeholder="For example, A"
        />
        <Select
          label="Floor"
          value={data.floor}
          onChange={(e) => onFieldChange('floor', e.target.value)}
          placeholder="Select floor"
          options={FLOOR_OPTIONS}
        />
        <Select
          label="Class teacher"
          value={data.incharge}
          onChange={(e) => onFieldChange('incharge', e.target.value)}
          placeholder="Select teacher"
          options={availableTeacherOptions}
          hint="Teachers who already lead another section aren't listed."
        />
        <fieldset className="tc-subject-picker is-wide">
          <legend className="cb-field__label">Subjects</legend>
          {subjectOptions.length > 0 ? (
            <div className="tc-subject-picker__grid">
              {subjectOptions.map((subj) => (
                <Checkbox
                  key={subj}
                  label={subj}
                  checked={data.subjects.includes(subj)}
                  onChange={() => onToggleSubject(subj)}
                />
              ))}
            </div>
          ) : (
            <p className="cb-muted tc-subject-picker__empty">
              No subjects yet. Add them under Timetable › Subjects, then come back to pick them here.
            </p>
          )}
        </fieldset>
      </div>
    </Sheet>
  )
}

export default TimetableClasses
