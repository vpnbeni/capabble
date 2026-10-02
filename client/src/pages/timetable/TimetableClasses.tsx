import React, { useEffect, useMemo, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { useTimetable, type TimetableClass } from '@/contexts/TimetableContext'

const FLOOR_OPTIONS = ['Ground Floor', 'First Floor', 'Second Floor', 'Third Floor']

/** Per-subject colour palette — same subject always gets same colour across timetable pages */
const SUBJECT_COLORS: Record<string, { bg: string; text: string; darkBg: string; darkText: string }> = {}
const SUBJECT_PALETTE = [
  { bg: '#eef2ff', text: '#4338ca', darkBg: '#312e8144', darkText: '#a5b4fc' },
  { bg: '#f0fdf4', text: '#166534', darkBg: '#14532d44', darkText: '#86efac' },
  { bg: '#fef3c7', text: '#92400e', darkBg: '#78350f44', darkText: '#fcd34d' },
  { bg: '#fce7f3', text: '#9d174d', darkBg: '#831843aa', darkText: '#f9a8d4' },
  { bg: '#e0f2fe', text: '#075985', darkBg: '#0c4a6e44', darkText: '#7dd3fc' },
  { bg: '#fae8ff', text: '#6b21a8', darkBg: '#581c8744', darkText: '#d8b4fe' },
  { bg: '#fff7ed', text: '#9a3412', darkBg: '#7c2d1244', darkText: '#fdba74' },
  { bg: '#f1f5f9', text: '#334155', darkBg: '#33415544', darkText: '#cbd5e1' },
  { bg: '#ecfdf5', text: '#065f46', darkBg: '#064e3b44', darkText: '#6ee7b7' },
  { bg: '#fef2f2', text: '#991b1b', darkBg: '#7f1d1d44', darkText: '#fca5a5' },
  { bg: '#eff6ff', text: '#1e40af', darkBg: '#1e3a5f44', darkText: '#93c5fd' },
  { bg: '#f5f3ff', text: '#5b21b6', darkBg: '#4c1d9544', darkText: '#c4b5fd' },
]
let _subjectColorIdx = 0
const getSubjectColor = (subject: string) => {
  const key = subject.trim().toLowerCase()
  if (!key) return SUBJECT_PALETTE[0]
  if (!SUBJECT_COLORS[key]) {
    SUBJECT_COLORS[key] = SUBJECT_PALETTE[_subjectColorIdx % SUBJECT_PALETTE.length]
    _subjectColorIdx++
  }
  return SUBJECT_COLORS[key]
}

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

  const handleDeleteSelected = () => {
    const idsToDelete = classes.map((item) => item.id)

    if (idsToDelete.length === 0) return

    const confirmMessage = `Delete all ${idsToDelete.length} class-section combination(s)? This cannot be undone.`
    if (!window.confirm(confirmMessage)) return

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

  // ── Floor badge class ──
  const floorBadgeClass = (floor: string) => {
    switch (floor) {
      case 'Ground Floor': return 'tc-floor-ground'
      case 'First Floor': return 'tc-floor-first'
      case 'Second Floor': return 'tc-floor-second'
      case 'Third Floor': return 'tc-floor-third'
      default: return 'tc-floor-default'
    }
  }

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

  const handleDeleteSelectedMatrixClasses = () => {
    if (selectedMatrixClassIds.size === 0) return

    const selectedRows = matrixClasses.filter((item) => selectedMatrixClassIds.has(item.id))
    if (selectedRows.length === 0) return

    const confirmMessage = `Delete ${selectedRows.length} selected class${selectedRows.length === 1 ? '' : 'es'} from the matrix? Related class-section rows will also be removed.`
    if (!window.confirm(confirmMessage)) return

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
      window.alert('Please enter a valid class name for each class row.')
      return
    }
    if (normalizedMatrixSections.some((item) => !item.name)) {
      window.alert('Please enter a valid section name for each section column.')
      return
    }

    const classNameSet = new Set(normalizedMatrixClasses.map((item) => item.name.toLowerCase()))
    if (classNameSet.size !== normalizedMatrixClasses.length) {
      window.alert('Duplicate class names are not allowed in the matrix.')
      return
    }

    const sectionNameSet = new Set(normalizedMatrixSections.map((item) => item.name.toLowerCase()))
    if (sectionNameSet.size !== normalizedMatrixSections.length) {
      window.alert('Duplicate section names are not allowed in the matrix.')
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

    if (idsToDelete.length > 0) {
      const confirmed = window.confirm(
        `${idsToDelete.length} existing class-section combination(s) are not selected in the matrix and will be removed. Continue?`
      )
      if (!confirmed) return
    }

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

    toast.success('Classes and sections saved.')
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

  return (
    <div className="tc-page">
      <style>{`
        /* ───────── Page ───────── */
        .tc-page {
          padding: 12px 32px 32px;
          max-width: 1600px;
          margin: 0 auto;
        }

        /* ───────── Card ───────── */
        .tc-card {
          background: #fff;
          border-radius: 16px;
          box-shadow: none;
          overflow: hidden;
          margin-bottom: 32px;
          border: 1px solid #e8ecf1;
        }
        .tc-card:hover {
          border-color: #dbe3ec;
        }
        .dark .tc-card {
          background: #1e293b;
          border-color: #334155;
        }

        /* ───────── Header ───────── */
        .tc-card-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 20px 28px;
          background: linear-gradient(135deg, #f0f4ff 0%, #faf5ff 100%);
          border-bottom: 1px solid #e2e8f0;
        }
        .dark .tc-card-header {
          background: linear-gradient(135deg, #1e2a3e 0%, #2a1e3e 100%);
          border-color: #334155;
        }
        .tc-card-header h3 {
          font-size: 1.15rem;
          font-weight: 700;
          color: #1e293b;
          margin: 0;
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .dark .tc-card-header h3 {
          color: #f1f5f9;
        }
        .tc-header-icon {
          width: 28px;
          height: 28px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          background: linear-gradient(135deg, #6366f1, #8b5cf6);
        }
        .tc-header-icon svg {
          width: 18px;
          height: 18px;
          color: #fff;
        }

        /* ───────── Header stats ───────── */
        .tc-header-stats {
          display: flex;
          align-items: center;
          gap: 10px;
          flex: 1;
          justify-content: center;
          min-width: 0;
          overflow-x: auto;
          padding: 2px 8px;
        }
        .tc-stat-card-inline {
          min-width: 82px;
          flex: 0 0 auto;
          padding: 6px 7px;
          border-radius: 8px;
          gap: 6px;
          display: flex;
          align-items: center;
        }
        .tc-stat-icon {
          width: 22px;
          height: 22px;
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .tc-stat-icon svg { width: 12px; height: 12px; color: #fff; }
        .tc-stat-value {
          font-size: 0.95rem;
          line-height: 1.05;
          font-weight: 800;
          color: #1e293b;
        }
        .dark .tc-stat-value { color: #f1f5f9; }
        .tc-stat-label {
          font-size: 0.5rem;
          letter-spacing: 0.04em;
          font-weight: 600;
          color: #94a3b8;
          text-transform: uppercase;
        }

        .tc-bg-indigo-soft { background: linear-gradient(135deg, #eef2ff 0%, #f5f3ff 100%); }
        .tc-bg-green-soft { background: linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%); }
        .tc-bg-indigo-grad { background: linear-gradient(135deg, #6366f1, #8b5cf6); }
        .tc-bg-green-grad { background: linear-gradient(135deg, #10b981, #059669); }

        .dark .tc-bg-indigo-soft { background: linear-gradient(135deg, #312e81 0%, #3b2f6b 100%); }
        .dark .tc-bg-green-soft { background: linear-gradient(135deg, #064e3b 0%, #065f46 100%); }

        /* ───────── Buttons ───────── */
        .tc-btn-group {
          display: flex;
          gap: 10px;
          align-items: center;
          flex-wrap: wrap;
        }
        .tc-btn {
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
        .tc-btn svg { width: 16px; height: 16px; }
        .tc-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .tc-btn-primary {
          background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
          color: #fff;
          box-shadow: 0 2px 10px rgba(99, 102, 241, 0.35);
        }
        .tc-btn-primary:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 4px 16px rgba(99, 102, 241, 0.45);
        }
        .tc-btn-danger {
          background: #fff;
          color: #ef4444;
          border: 1.5px solid #fecaca;
          box-shadow: 0 1px 3px rgba(239, 68, 68, 0.1);
        }
        .tc-btn-danger:hover:not(:disabled) {
          background: #fef2f2;
          border-color: #fca5a5;
          transform: translateY(-1px);
        }

        /* ───────── Table ───────── */
        .tc-table-wrap { overflow-x: auto; }
        .tc-table {
          width: 100%;
          border-collapse: collapse;
          border-spacing: 0;
        }
        .tc-table thead th {
          padding: 14px 20px;
          font-size: 0.72rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: #64748b;
          background: #f8fafc;
          border-bottom: 1px solid #e2e8f0;
          border-top: none;
          text-align: left;
          white-space: nowrap;
        }
        .dark .tc-table thead th {
          background: #1e293b;
          color: #94a3b8;
          border-color: #334155;
        }
        .tc-table tbody tr { transition: background 0.15s ease; }
        .tc-table tbody tr:hover { background: #f1f5f9; }
        .dark .tc-table tbody tr:hover { background: #283548; }
        .tc-table tbody tr:nth-child(even) { background: #fafbfd; }
        .dark .tc-table tbody tr:nth-child(even) { background: #1a2536; }
        .tc-table tbody tr:nth-child(even):hover { background: #f1f5f9; }
        .dark .tc-table tbody tr:nth-child(even):hover { background: #283548; }
        .tc-table tbody td {
          padding: 14px 20px;
          font-size: 0.88rem;
          color: #334155;
          border-top: none;
          border-bottom: 1px solid #f1f5f9;
          white-space: nowrap;
        }
        .dark .tc-table tbody td {
          color: #e2e8f0;
          border-color: #1e293b;
        }
        .tc-table tbody tr:first-child td {
          border-top: none;
        }
        .tc-table thead th:first-child,
        .tc-table tbody td:first-child {
          width: 48px;
          padding-left: 20px;
          padding-right: 8px;
        }

        /* ───────── Serial number ───────── */
        .tc-sr {
          font-weight: 600;
          color: #94a3b8;
          font-size: 0.82rem;
          min-width: 32px;
          display: inline-block;
        }

        /* ───────── Value styles ───────── */
        .tc-class-name {
          font-weight: 700;
          color: #1e293b;
          font-size: 0.9rem;
        }
        .dark .tc-class-name { color: #f1f5f9; }
        .tc-section {
          font-weight: 600;
          color: #475569;
        }
        .dark .tc-section { color: #cbd5e1; }
        .tc-incharge {
          color: #475569;
          font-weight: 500;
        }
        .dark .tc-incharge { color: #cbd5e1; }

        /* ───────── Floor badges ───────── */
        .tc-floor-badge {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 4px 12px;
          border-radius: 20px;
          font-size: 0.75rem;
          font-weight: 600;
          letter-spacing: 0.01em;
        }
        .tc-floor-ground { background: #ecfdf5; color: #059669; }
        .tc-floor-first { background: #eff6ff; color: #2563eb; }
        .tc-floor-second { background: #fef3c7; color: #d97706; }
        .tc-floor-third { background: #f3e8ff; color: #7c3aed; }
        .tc-floor-default { background: #f1f5f9; color: #475569; }
        .dark .tc-floor-ground { background: #064e3b33; color: #34d399; }
        .dark .tc-floor-first { background: #1e3a5f33; color: #60a5fa; }
        .dark .tc-floor-second { background: #78350f33; color: #fbbf24; }
        .dark .tc-floor-third { background: #4c1d9533; color: #a78bfa; }
        .dark .tc-floor-default { background: #33415533; color: #94a3b8; }

        /* ───────── Subject pills ───────── */
        .tc-subject-pills {
          display: flex;
          flex-wrap: wrap;
          gap: 4px;
        }
        .tc-subject-pill {
          display: inline-flex;
          align-items: center;
          padding: 2px 10px;
          border-radius: 12px;
          font-size: 0.72rem;
          font-weight: 600;
          background: #eef2ff;
          color: #4f46e5;
        }
        .dark .tc-subject-pill {
          background: #312e8133;
          color: #a5b4fc;
        }
        .tc-no-subjects {
          color: #94a3b8;
          font-size: 0.82rem;
          font-style: italic;
        }

        /* ───────── Subject multi-select dropdown ───────── */
        .tc-subject-select-wrap {
          position: relative;
        }
        .tc-subject-select-trigger {
          width: 100%;
          padding: 6px 12px;
          border: 1.5px solid #e2e8f0;
          border-radius: 8px;
          font-size: 0.85rem;
          background: #fff;
          color: #334155;
          cursor: pointer;
          text-align: left;
          min-height: 36px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          transition: all 0.2s ease;
          outline: none;
        }
        .dark .tc-subject-select-trigger {
          background: #1e293b;
          border-color: #475569;
          color: #e2e8f0;
        }
        .tc-subject-select-trigger:focus {
          border-color: #6366f1;
          box-shadow: 0 0 0 3px rgba(99,102,241,0.15);
        }
        .tc-subject-select-trigger svg {
          width: 14px;
          height: 14px;
          flex-shrink: 0;
          color: #94a3b8;
        }
        .tc-subject-dropdown {
          position: absolute;
          top: 100%;
          left: 0;
          right: 0;
          z-index: 50;
          margin-top: 4px;
          background: #fff;
          border: 1.5px solid #e2e8f0;
          border-radius: 10px;
          box-shadow: 0 8px 30px rgba(0,0,0,0.12);
          max-height: 220px;
          overflow-y: auto;
          padding: 4px;
        }
        .dark .tc-subject-dropdown {
          background: #1e293b;
          border-color: #475569;
          box-shadow: 0 8px 30px rgba(0,0,0,0.4);
        }
        .tc-subject-option {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 7px 10px;
          border-radius: 6px;
          font-size: 0.82rem;
          font-weight: 500;
          color: #334155;
          cursor: pointer;
          transition: background 0.12s ease;
          user-select: none;
        }
        .tc-subject-option:hover {
          background: #f1f5f9;
        }
        .dark .tc-subject-option {
          color: #e2e8f0;
        }
        .dark .tc-subject-option:hover {
          background: #334155;
        }
        .tc-subject-option input[type="checkbox"] {
          width: 15px;
          height: 15px;
          accent-color: #6366f1;
          border-radius: 3px;
          cursor: pointer;
          flex-shrink: 0;
        }

        /* ───────── Action links ───────── */
        .tc-action-link {
          font-size: 0.82rem;
          font-weight: 600;
          padding: 4px 12px;
          border-radius: 6px;
          border: none;
          background: none;
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .tc-action-edit { color: #6366f1; }
        .tc-action-edit:hover { background: #eef2ff; color: #4f46e5; }
        .dark .tc-action-edit { color: #818cf8; }
        .dark .tc-action-edit:hover { background: #312e8133; }
        .tc-action-save { color: #10b981; }
        .tc-action-save:hover { background: #ecfdf5; color: #059669; }
        .tc-action-cancel { color: #94a3b8; }
        .tc-action-cancel:hover { background: #f1f5f9; color: #64748b; }
        .tc-action-group { display: flex; gap: 8px; }
        .tc-edit-icon {
          width: 14px;
          height: 14px;
          display: inline;
          margin-right: 4px;
          vertical-align: -2px;
        }

        /* ───────── Checkbox ───────── */
        .tc-checkbox-label {
          display: flex;
          align-items: center;
          cursor: pointer;
        }
        .tc-checkbox {
          width: 16px;
          height: 16px;
          border-radius: 4px;
          accent-color: #6366f1;
        }

        /* ───────── New row ───────── */
        .tc-new-row {
          background: linear-gradient(90deg, #eef2ff 0%, #f5f3ff 100%) !important;
        }
        .dark .tc-new-row {
          background: linear-gradient(90deg, #1e2a4a 0%, #2a1e4a 100%) !important;
        }

        /* ───────── Input ───────── */
        .tc-input {
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
        .dark .tc-input {
          background: #1e293b;
          border-color: #475569;
          color: #e2e8f0;
        }
        .tc-input:focus {
          border-color: #6366f1;
          box-shadow: 0 0 0 3px rgba(99,102,241,0.15);
        }

        /* ───────── Empty state ───────── */
        .tc-empty {
          padding: 48px 24px;
          text-align: center;
        }
        .tc-empty-icon {
          width: 64px;
          height: 64px;
          margin: 0 auto 16px;
          border-radius: 16px;
          background: linear-gradient(135deg, #f0f4ff 0%, #faf5ff 100%);
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .tc-empty-icon svg {
          width: 32px;
          height: 32px;
          color: #94a3b8;
        }
        .tc-empty h3 {
          font-size: 1.05rem;
          font-weight: 700;
          color: #334155;
          margin: 0 0 6px;
        }
        .dark .tc-empty h3 { color: #f1f5f9; }
        .tc-empty p {
          color: #94a3b8;
          font-size: 0.88rem;
          margin: 0 0 20px;
        }

        /* ————————— Summary table ————————— */
        .tc-summary-card {
          margin-bottom: 14px;
          border-radius: 12px;
        }
        .tc-summary-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          padding: 8px 14px;
          border-bottom: 1px solid #e2e8f0;
          background: linear-gradient(90deg, #f8fafc 0%, #eef2ff 100%);
        }
        .dark .tc-summary-header {
          border-color: #334155;
          background: linear-gradient(90deg, #1e293b 0%, #1e2a4a 100%);
        }
        .tc-summary-header h4 {
          margin: 0;
          font-size: 0.84rem;
          font-weight: 700;
          color: #1e293b;
        }
        .dark .tc-summary-header h4 {
          color: #f1f5f9;
        }
        .tc-summary-actions {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-wrap: wrap;
        }
        .tc-summary-btn {
          padding: 5px 10px;
          font-size: 0.72rem;
          border-radius: 7px;
        }
        .tc-summary-card .tc-table-wrap {
          width: 100%;
        }
        .tc-summary-table {
          width: 100%;
          table-layout: fixed;
        }
        .tc-summary-table thead th {
          background: #f1f5f9;
          width: auto;
          padding: 6px;
          font-size: 0.65rem;
          letter-spacing: 0.04em;
          vertical-align: middle;
        }
        .dark .tc-summary-table thead th {
          background: #1f2c3f;
        }
        .tc-summary-table tbody td {
          width: auto;
          padding: 4px 6px;
          vertical-align: middle;
        }
        .tc-summary-table thead th:first-child,
        .tc-summary-table tbody td:first-child {
          width: 32px;
          padding-left: 6px;
          padding-right: 6px;
        }
        .tc-summary-table .tc-sr {
          font-size: 0.75rem;
          min-width: 20px;
          display: inline-flex;
          justify-content: center;
          width: 100%;
        }
        .tc-summary-table .tc-matrix-sr-col,
        .tc-summary-table .tc-matrix-class-col,
        .tc-summary-table .tc-matrix-class-cell,
        .tc-summary-table .tc-matrix-section-col,
        .tc-summary-table .tc-matrix-cell,
        .tc-summary-table .tc-matrix-select-col {
          text-align: center;
        }
        .tc-summary-table .tc-matrix-class-cell {
          min-width: 0;
        }
        .tc-matrix-class-input,
        .tc-matrix-section-input {
          width: auto;
          max-width: 100%;
          min-width: 2.75rem;
          field-sizing: content;
          padding: 3px 8px;
          border: 1px solid #dbe4f0;
          border-radius: 6px;
          font-size: 0.75rem;
          font-weight: 600;
          background: #fff;
          color: #334155;
          outline: none;
          text-align: center;
          display: block;
          margin-inline: auto;
          transition: border-color 0.15s ease, box-shadow 0.15s ease;
        }
        .tc-matrix-class-input:focus,
        .tc-matrix-section-input:focus {
          border-color: #6366f1;
          box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.14);
        }
        .dark .tc-matrix-class-input,
        .dark .tc-matrix-section-input {
          background: #1e293b;
          border-color: #475569;
          color: #e2e8f0;
        }
        .tc-matrix-cell .tc-checkbox-label,
        .tc-matrix-select-col .tc-checkbox-label {
          display: flex;
          justify-content: center;
          align-items: center;
          width: 100%;
          margin: 0;
          padding: 0;
        }
        .tc-matrix-checkbox {
          appearance: none;
          -webkit-appearance: none;
          width: 16px;
          height: 16px;
          margin: 0 auto;
          flex-shrink: 0;
          border: 1.5px solid #cbd5e1;
          border-radius: 4px;
          background: #fff;
          cursor: pointer;
          position: relative;
          display: block;
          transition: border-color 0.15s ease, background 0.15s ease, box-shadow 0.15s ease, transform 0.12s ease;
        }
        .tc-matrix-checkbox:hover {
          border-color: #818cf8;
          background: #f5f3ff;
        }
        .tc-matrix-checkbox:focus-visible {
          outline: none;
          box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.25);
          border-color: #6366f1;
        }
        .tc-matrix-checkbox:checked {
          background: linear-gradient(145deg, #6366f1 0%, #4f46e5 100%);
          border-color: #4f46e5;
          box-shadow: 0 1px 3px rgba(79, 70, 229, 0.35);
        }
        .tc-matrix-checkbox:checked:hover {
          background: linear-gradient(145deg, #4f46e5 0%, #4338ca 100%);
          border-color: #4338ca;
        }
        .tc-matrix-checkbox:checked::after {
          content: '';
          position: absolute;
          left: 4.5px;
          top: 1.5px;
          width: 4px;
          height: 8px;
          border: solid #fff;
          border-width: 0 1.75px 1.75px 0;
          transform: rotate(45deg);
        }
        .tc-matrix-checkbox:indeterminate {
          background: linear-gradient(145deg, #6366f1 0%, #4f46e5 100%);
          border-color: #4f46e5;
        }
        .tc-matrix-checkbox:indeterminate::after {
          content: '';
          position: absolute;
          left: 3px;
          top: 6px;
          width: 8px;
          height: 0;
          border: none;
          border-top: 2px solid #fff;
          transform: none;
        }
        .dark .tc-matrix-checkbox {
          background: #0f172a;
          border-color: #64748b;
        }
        .dark .tc-matrix-checkbox:hover {
          background: #1e1b4b;
          border-color: #818cf8;
        }
        .dark .tc-matrix-checkbox:checked,
        .dark .tc-matrix-checkbox:indeterminate {
          background: linear-gradient(145deg, #818cf8 0%, #6366f1 100%);
          border-color: #6366f1;
        }
        .tc-matrix-select-col {
          width: 32px;
          text-align: center;
        }
        .tc-summary-empty {
          padding: 10px 14px;
          color: #94a3b8;
          font-size: 0.8rem;
        }
      `}</style>

      <div className="tc-card tc-summary-card">
        <div className="tc-summary-header">
          <h4>Class Section Matrix</h4>
          <div className="tc-summary-actions">
            <button
              onClick={handleDeleteSelectedMatrixClasses}
              disabled={selectedMatrixClassIds.size === 0}
              className="tc-btn tc-btn-danger tc-summary-btn"
            >
              Delete Selected{selectedMatrixClassIds.size > 0 ? ` (${selectedMatrixClassIds.size})` : ''}
            </button>
            <button onClick={handleAddMatrixClass} className="tc-btn tc-btn-primary tc-summary-btn">
              Add Class
            </button>
            <button onClick={handleAddMatrixSection} className="tc-btn tc-btn-primary tc-summary-btn">
              Add Section
            </button>
            <button
              onClick={handleSaveMatrixToLowerTable}
              className="tc-btn tc-btn-primary tc-summary-btn"
            >
              {matrixDirty ? 'Save changes' : 'Save'}
            </button>
          </div>
        </div>
        <div className="tc-table-wrap">
          <table className="tc-table tc-summary-table">
            <thead>
              <tr>
                <th className="tc-matrix-select-col">
                  <label className="tc-checkbox-label">
                    <input
                      type="checkbox"
                      checked={allMatrixClassesSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = someMatrixClassesSelected && !allMatrixClassesSelected
                      }}
                      onChange={toggleAllMatrixClasses}
                      className="tc-matrix-checkbox"
                      aria-label="Select all classes"
                    />
                  </label>
                </th>
                <th className="tc-matrix-sr-col">Sr No</th>
                <th className="tc-matrix-class-col">Class</th>
                {matrixSections.length > 0 ? (
                  matrixSections.map((section, index) => (
                    <th key={section.id} className="tc-matrix-section-col">
                      <input
                        type="text"
                        value={matrixSectionDrafts[section.id] ?? section.name}
                        placeholder={`Section ${index + 1}`}
                        size={inputSizeFor(matrixSectionDrafts[section.id] ?? section.name, `Section ${index + 1}`, 6)}
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
                        className="tc-matrix-section-input"
                      />
                    </th>
                  ))
                ) : (
                  <th className="tc-matrix-section-col">Sections</th>
                )}
              </tr>
            </thead>
            <tbody>
              {matrixClasses.length > 0 ? (
                matrixClasses.map((row, index) => (
                  <tr key={row.id}>
                    <td className="tc-matrix-select-col">
                      <label className="tc-checkbox-label">
                        <input
                          type="checkbox"
                          checked={selectedMatrixClassIds.has(row.id)}
                          onChange={() => toggleMatrixClassSelection(row.id)}
                          className="tc-matrix-checkbox"
                          aria-label={`Select ${matrixClassDrafts[row.id] || row.name || `class ${index + 1}`}`}
                        />
                      </label>
                    </td>
                    <td className="tc-matrix-sr-col"><span className="tc-sr">{index + 1}</span></td>
                    <td className="tc-matrix-class-cell">
                      <input
                        type="text"
                        value={matrixClassDrafts[row.id] ?? row.name}
                        placeholder={`Class ${index + 1}`}
                        size={inputSizeFor(matrixClassDrafts[row.id] ?? row.name, `Class ${index + 1}`, 4)}
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
                        className="tc-matrix-class-input"
                      />
                    </td>
                    {matrixSections.length > 0 ? (
                      matrixSections.map((section) => (
                        <td key={section.id} className="tc-matrix-cell">
                          <label className="tc-checkbox-label">
                            <input
                              type="checkbox"
                              checked={Boolean(matrixSelection[row.id]?.[section.id])}
                              onChange={() => toggleMatrixSelection(row.id, section.id)}
                              className="tc-matrix-checkbox"
                            />
                          </label>
                        </td>
                      ))
                    ) : (
                      <td>
                        <span className="tc-no-subjects">Add section columns first</span>
                      </td>
                    )}
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={Math.max(3 + matrixSections.length, 4)}>
                    <div className="tc-summary-empty">Add classes and sections, tick checkboxes, then click Save.</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="tc-card">
        {/* ── Header ── */}
        <div className="tc-card-header">
          <div>
            <h3>
              <span className="tc-header-icon">
                <svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.438 60.438 0 0 0-.491 6.347A48.62 48.62 0 0 1 12 20.904a48.62 48.62 0 0 1 8.232-4.41 60.46 60.46 0 0 0-.491-6.347m-15.482 0a50.636 50.636 0 0 0-2.658-.813A59.906 59.906 0 0 1 12 3.493a59.903 59.903 0 0 1 10.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.717 50.717 0 0 1 12 13.489a50.702 50.702 0 0 1 7.74-3.342M6.75 15a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm0 0v-3.675A55.378 55.378 0 0 1 12 8.443m-7.007 11.55A5.981 5.981 0 0 0 6.75 15.75v-1.5" />
                </svg>
              </span>
              Classes & Sections
            </h3>
          </div>
          <div className="tc-header-stats">
            <div className="tc-stat-card-inline tc-bg-indigo-soft">
              <div className="tc-stat-icon tc-bg-indigo-grad">
                <svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.438 60.438 0 0 0-.491 6.347A48.62 48.62 0 0 1 12 20.904a48.62 48.62 0 0 1 8.232-4.41 60.46 60.46 0 0 0-.491-6.347m-15.482 0a50.636 50.636 0 0 0-2.658-.813A59.906 59.906 0 0 1 12 3.493a59.903 59.903 0 0 1 10.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.717 50.717 0 0 1 12 13.489a50.702 50.702 0 0 1 7.74-3.342" />
                </svg>
              </div>
              <div>
                <div className="tc-stat-value">{uniqueClasses}</div>
                <div className="tc-stat-label">Classes</div>
              </div>
            </div>
            <div className="tc-stat-card-inline tc-bg-green-soft">
              <div className="tc-stat-icon tc-bg-green-grad">
                <svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
                </svg>
              </div>
              <div>
                <div className="tc-stat-value">{totalSections}</div>
                <div className="tc-stat-label">Sections</div>
              </div>
            </div>
          </div>
          <div className="tc-btn-group">
            {classes.length > 0 && (
              <button onClick={handleDeleteSelected} className="tc-btn tc-btn-danger">
                <svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                </svg>
                Delete All
              </button>
            )}
          </div>
        </div>

        {/* ── Table ── */}
        <div className="tc-table-wrap">
          <table className="tc-table">
            <thead>
              <tr>
                <th>
                  <label className="tc-checkbox-label">
                    <input
                      type="checkbox"
                      checked={allOnPageSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = someOnPageSelected && !allOnPageSelected
                      }}
                      onChange={selectAllOnPage}
                      className="tc-checkbox"
                      aria-label="Select all"
                    />
                  </label>
                </th>
                <th>Sr No</th>
                <th>Class</th>
                <th>Section</th>
                <th>Floor</th>
                <th>Subjects</th>
                <th>Incharge</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {/* Rows */}
              {classes.map((item, index) => {
                const isEditing = editingId === item.id
                const visibleSubjects = normalizeSelectedSubjects(item.subjects)
                if (isEditing) {
                  return (
                    <NewOrEditRow
                      key={item.id}
                      mode="edit"
                      index={index}
                      selected={selectedIds.has(item.id)}
                      onToggleSelect={() => toggleSelection(item.id)}
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
                      onSave={() => handleSave(item.id)}
                      onCancel={handleCancelEdit}
                    />
                  )
                }

                return (
                  <tr key={item.id}>
                    <td>
                      <label className="tc-checkbox-label">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(item.id)}
                          onChange={() => toggleSelection(item.id)}
                          className="tc-checkbox"
                          aria-label={`Select ${item.className} ${item.section}`}
                        />
                      </label>
                    </td>
                    <td><span className="tc-sr">{index + 1}</span></td>
                    <td><span className="tc-class-name">{item.className}</span></td>
                    <td><span className="tc-section">{item.section}</span></td>
                    <td>
                      <span className={`tc-floor-badge ${floorBadgeClass(item.floor)}`}>
                        {item.floor}
                      </span>
                    </td>
                    <td>
                      {visibleSubjects.length > 0 ? (
                        <div className="tc-subject-pills">
                          {visibleSubjects.map((s) => {
                            const color = getSubjectColor(s)
                            return (
                              <span
                                key={s}
                                className="tc-subject-pill"
                                style={{
                                  background: color.bg,
                                  color: color.text,
                                }}
                              >
                                {s}
                              </span>
                            )
                          })}
                        </div>
                      ) : (
                        <span className="tc-no-subjects">No subjects</span>
                      )}
                    </td>
                    <td><span className="tc-incharge">{item.incharge || '—'}</span></td>
                    <td>
                      <button onClick={() => handleEdit(item)} className="tc-action-link tc-action-edit">
                        <svg className="tc-edit-icon" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
                        </svg>
                        Edit
                      </button>
                    </td>
                  </tr>
                )
              })}

              {/* Empty state */}
              {classes.length === 0 && (
                <tr>
                  <td colSpan={8}>
                    <div className="tc-empty">
                      <div className="tc-empty-icon">
                        <svg fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.438 60.438 0 0 0-.491 6.347A48.62 48.62 0 0 1 12 20.904a48.62 48.62 0 0 1 8.232-4.41 60.46 60.46 0 0 0-.491-6.347m-15.482 0a50.636 50.636 0 0 0-2.658-.813A59.906 59.906 0 0 1 12 3.493a59.903 59.903 0 0 1 10.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.717 50.717 0 0 1 12 13.489a50.702 50.702 0 0 1 7.74-3.342M6.75 15a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm0 0v-3.675A55.378 55.378 0 0 1 12 8.443m-7.007 11.55A5.981 5.981 0 0 0 6.75 15.75v-1.5" />
                        </svg>
                      </div>
                      <h3>No Classes Added</h3>
                      <p>Use the Class Section Matrix above, then click Save to populate this table.</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════
   Inline-editing row (shared between "add new" and "edit")
   ═══════════════════════════════════════════════════ */
interface RowProps {
  mode: 'new' | 'edit'
  index?: number
  selected?: boolean
  onToggleSelect?: () => void
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

const NewOrEditRow: React.FC<RowProps> = ({
  mode,
  index,
  selected,
  onToggleSelect,
  data,
  subjectOptions,
  teacherOptions,
  blockedTeacherKeys,
  onFieldChange,
  onToggleSubject,
  onSave,
  onCancel,
}) => {
  const [dropdownOpen, setDropdownOpen] = useState(false)
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
    <tr className={mode === 'new' ? 'tc-new-row' : undefined}>
      <td>
        {mode === 'edit' && onToggleSelect ? (
          <label className="tc-checkbox-label">
            <input
              type="checkbox"
              checked={selected}
              onChange={onToggleSelect}
              className="tc-checkbox"
            />
          </label>
        ) : null}
      </td>
      <td>
        <span className="tc-sr">{mode === 'new' ? '—' : (index ?? 0) + 1}</span>
      </td>
      <td>
        <input
          type="text"
          title="Class name"
          value={data.className}
          onChange={(e) => onFieldChange('className', e.target.value)}
          placeholder="e.g. 10"
          className="tc-input"
        />
      </td>
      <td>
        <input
          type="text"
          title="Section"
          value={data.section}
          onChange={(e) => onFieldChange('section', e.target.value)}
          placeholder="e.g. A"
          className="tc-input"
        />
      </td>
      <td>
        <select
          title="Floor"
          value={data.floor}
          onChange={(e) => onFieldChange('floor', e.target.value)}
          className="tc-input"
        >
          <option value="">Select Floor</option>
          {FLOOR_OPTIONS.map((f) => (
            <option key={f} value={f}>{f}</option>
          ))}
        </select>
      </td>
      <td>
        <div className="tc-subject-select-wrap">
          <button
            type="button"
            className="tc-subject-select-trigger"
            onClick={() => setDropdownOpen((o) => !o)}
          >
            <span>
              {data.subjects.length === 0
                ? 'Select subjects...'
                : `${data.subjects.length} selected`}
            </span>
            <svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
            </svg>
          </button>
          {dropdownOpen && (
            <div className="tc-subject-dropdown">
              {subjectOptions.map((subj) => (
                <label key={subj} className="tc-subject-option">
                  <input
                    type="checkbox"
                    checked={data.subjects.includes(subj)}
                    onChange={() => onToggleSubject(subj)}
                  />
                  {subj}
                </label>
              ))}
            </div>
          )}
        </div>
      </td>
      <td>
        <select
          title="Class incharge"
          value={data.incharge}
          onChange={(e) => onFieldChange('incharge', e.target.value)}
          className="tc-input"
        >
          <option value="">Select teacher</option>
          {availableTeacherOptions.map((teacherName) => (
            <option key={teacherName} value={teacherName}>
              {teacherName}
            </option>
          ))}
        </select>
      </td>
      <td>
        <div className="tc-action-group">
          <button onClick={onSave} className="tc-action-link tc-action-save">Save</button>
          <button onClick={onCancel} className="tc-action-link tc-action-cancel">Cancel</button>
        </div>
      </td>
    </tr>
  )
}

export default TimetableClasses
