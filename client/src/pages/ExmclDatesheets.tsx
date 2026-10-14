import React, { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import datesheetService from '@/services/datesheetService'
import subjectService from '@/services/subjectService'
import exmclExamService, { type ExmclExamDefinition } from '@/services/exmclExamService'
import { useAcademicSession } from '@/contexts/AcademicSessionContext'
import { useTimetable } from '@/contexts/TimetableContext'
import { isSeniorSecondaryClass, sortClassNames, sortSectionNames } from '@/constants/studentClasses'
import api from '@/services/api'
import { CalendarDays, Plus, RefreshCw, Trash2 } from 'lucide-react'
import {
  Badge,
  Button,
  Card,
  CardToolbar,
  DataTable,
  DetailList,
  EmptyState,
  FilterBar,
  Page,
  Select,
  Sheet,
  TextField,
  formatDate,
  formatTime,
  type DataTableColumn,
} from '@/components/ui'
import { errorMessage } from '@/components/exmcl/ExmclUi'
import '@/components/exmcl/exmcl.css'
import '@/components/exmcl/datesheets.css'

type SubjectOption = {
  _id: string
  name: string
  code: string
  class: string
  duration?: number
}

type ScheduleRow = {
  id: string
  subjectId: string
  examDate: string
  start: string
  end: string
  duration: number
}

type SavedDatesheet = {
  _id: string
  title: string
  class: string
  section?: string
  examId?: { _id?: string; name?: string; code?: string } | string
  subjects: Array<{
    _id?: string
    subject?: { _id?: string; name?: string; code?: string }
    examDate?: string
    timeSlot?: { start?: string; end?: string }
    duration?: number
  }>
  createdAt: string
}

type ClassSectionEntry = {
  _id?: { class?: string; section?: string }
  count?: number
  active?: number
}

const toAcademicYear = (session?: string | null) => {
  if (session && /^\d{4}-\d{4}$/.test(session)) return session
  const now = new Date()
  const year = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1
  return `${year}-${year + 1}`
}

const getExamLabel = (sheet: SavedDatesheet) => {
  if (sheet.examId && typeof sheet.examId === 'object') {
    return `${sheet.examId.code || ''} — ${sheet.examId.name || ''}`.trim()
  }
  return '—'
}

const getExamCode = (sheet: SavedDatesheet) =>
  sheet.examId && typeof sheet.examId === 'object' ? sheet.examId.code || '' : ''

const generateRowId = () => `row-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

const normalizeSubjectKey = (value: string) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')

const createEmptyRow = (subject?: SubjectOption): ScheduleRow => ({
  id: generateRowId(),
  subjectId: subject?._id || '',
  examDate: '',
  start: '10:30',
  end: '13:30',
  duration: Number(subject?.duration || 180),
})

const ExmclDatesheets: React.FC = () => {
  const { currentSession } = useAcademicSession()
  const {
    isHydrated: isTimetableHydrated,
    rehydrate: rehydrateTimetable,
    matrixClasses,
    matrixSections,
    matrixSelection,
    classes: timetableClasses,
  } = useTimetable()
  const [loading, setLoading] = useState(true)
  const [examsLoading, setExamsLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [exams, setExams] = useState<ExmclExamDefinition[]>([])
  const [subjects, setSubjects] = useState<SubjectOption[]>([])
  const [classSectionEntries, setClassSectionEntries] = useState<ClassSectionEntry[]>([])
  const [savedDatesheets, setSavedDatesheets] = useState<SavedDatesheet[]>([])
  const [selectedExamId, setSelectedExamId] = useState('')
  const [selectedClass, setSelectedClass] = useState('')
  const [selectedSection, setSelectedSection] = useState('')
  const [title, setTitle] = useState('')
  const [rows, setRows] = useState<ScheduleRow[]>([createEmptyRow()])
  const [tried, setTried] = useState(false)
  const [search, setSearch] = useState('')
  const [previewing, setPreviewing] = useState<SavedDatesheet | null>(null)

  const selectedExam = exams.find((exam) => exam._id === selectedExamId)
  const requiresSection = isSeniorSecondaryClass(selectedClass)

  const loadData = async () => {
    setLoading(true)
    setExamsLoading(true)

    const [examResult, subjectResult, datesheetResult, statsResult] = await Promise.allSettled([
      exmclExamService.getAll(),
      subjectService.getAll({ page: 1, limit: 500 }),
      datesheetService.getAll({ examType: 'internal' }),
      api.get('/students/stats', { params: { lite: true } }),
    ])

    if (examResult.status === 'fulfilled') {
      setExams(examResult.value)
    } else {
      setExams([])
      toast.error('Exams didn’t load. Check that Exams is turned on for your school, then refresh.')
    }
    setExamsLoading(false)

    if (subjectResult.status === 'fulfilled') {
      setSubjects(Array.isArray(subjectResult.value?.data?.data) ? subjectResult.value.data.data : [])
    } else {
      setSubjects([])
    }

    if (datesheetResult.status === 'fulfilled') {
      setSavedDatesheets(
        Array.isArray(datesheetResult.value?.data?.data?.datesheets)
          ? datesheetResult.value.data.data.datesheets
          : []
      )
    } else {
      setSavedDatesheets([])
    }

    if (statsResult.status === 'fulfilled') {
      setClassSectionEntries(
        Array.isArray(statsResult.value?.data?.data?.byClassSection)
          ? statsResult.value.data.data.byClassSection
          : []
      )
    } else {
      setClassSectionEntries([])
    }

    if (
      examResult.status === 'rejected' &&
      subjectResult.status === 'rejected' &&
      datesheetResult.status === 'rejected'
    ) {
      toast.error('Datesheets didn’t load. Check your connection and refresh.')
    }

    setLoading(false)
  }

  useEffect(() => {
    void loadData()
  }, [])

  useEffect(() => {
    if (!isTimetableHydrated) {
      void rehydrateTimetable()
    }
  }, [isTimetableHydrated, rehydrateTimetable])

  const classOptions = useMemo(() => {
    const names = new Set<string>()

    ;(matrixClasses || []).forEach((row) => {
      const className = String(row.name || '').trim()
      if (!className) return
      const hasSelectedSection = (matrixSections || []).some(
        (section) => Boolean(matrixSelection?.[row.id]?.[section.id])
      )
      if (hasSelectedSection || (matrixSections || []).length === 0) {
        names.add(className)
      }
    })

    ;(timetableClasses || []).forEach((row) => {
      const className = String(row.className || '').trim()
      if (className) names.add(className)
    })

    classSectionEntries.forEach((entry) => {
      const className = String(entry?._id?.class || '').trim()
      if (!className) return
      const enrolled = Number(entry.active ?? entry.count)
      if (!Number.isFinite(enrolled) || enrolled > 0) {
        names.add(className)
      }
    })

    subjects.forEach((item) => {
      const className = String(item.class || '').trim()
      if (className) names.add(className)
    })

    return Array.from(names).sort(sortClassNames)
  }, [matrixClasses, matrixSections, matrixSelection, timetableClasses, classSectionEntries, subjects])

  const sectionOptions = useMemo(() => {
    if (!requiresSection || !selectedClass) return []

    const classKey = selectedClass.trim().toLowerCase()
    const fromStudents = classSectionEntries
      .filter((entry) => String(entry?._id?.class || '').trim().toLowerCase() === classKey)
      .map((entry) => String(entry?._id?.section || '').trim())
      .filter(Boolean)

    const matrixClassRow = (matrixClasses || []).find(
      (row) => String(row.name || '').trim().toLowerCase() === classKey
    )
    const fromClassesPage = matrixClassRow
      ? (matrixSections || [])
          .filter((section) => Boolean(matrixSelection?.[matrixClassRow.id]?.[section.id]))
          .map((section) => String(section.name || '').trim())
          .filter(Boolean)
      : []

    const fromTimetableRows = (timetableClasses || [])
      .filter((row) => String(row.className || '').trim().toLowerCase() === classKey)
      .map((row) => String(row.section || '').trim())
      .filter(Boolean)

    return Array.from(new Set([...fromStudents, ...fromClassesPage, ...fromTimetableRows])).sort((a, b) =>
      sortSectionNames(a, b, selectedClass)
    )
  }, [
    classSectionEntries,
    matrixClasses,
    matrixSections,
    matrixSelection,
    requiresSection,
    selectedClass,
    timetableClasses,
  ])

  const filteredSubjects = useMemo(() => {
    if (!selectedClass || !selectedExamId) return []
    const classKey = selectedClass.trim().toLowerCase()
    const examKeys = new Set(
      (selectedExam?.subjectKeys || []).map((key) => normalizeSubjectKey(key)).filter(Boolean)
    )

    const byKey = new Map<string, SubjectOption>()

    const addSubject = (item: SubjectOption) => {
      const name = String(item.name || '').trim()
      if (!name) return
      if (String(item.class || '').trim().toLowerCase() !== classKey) return
      if (examKeys.size > 0) {
        const codeKey = normalizeSubjectKey(item.code)
        const nameKey = normalizeSubjectKey(item.name)
        if (!examKeys.has(codeKey) && !examKeys.has(nameKey)) return
      }
      byKey.set(item._id || `${name}-${item.code}`, item)
    }

    subjects.forEach((item) => addSubject(item))

    ;(timetableClasses || []).forEach((row) => {
      if (String(row.className || '').trim().toLowerCase() !== classKey) return
      if (requiresSection && selectedSection) {
        if (String(row.section || '').trim().toLowerCase() !== selectedSection.trim().toLowerCase()) return
      }
      ;(row.subjects || []).forEach((subjectName) => {
        const trimmed = String(subjectName || '').trim()
        if (!trimmed) return
        const key = normalizeSubjectKey(trimmed)
        if (examKeys.size > 0 && !examKeys.has(key)) return
        const existing = subjects.find(
          (item) =>
            String(item.class || '').trim().toLowerCase() === classKey &&
            normalizeSubjectKey(item.name) === key
        )
        if (existing) {
          addSubject(existing)
          return
        }
        addSubject({
          _id: `timetable-${key}`,
          name: trimmed,
          code: trimmed.slice(0, 8).toUpperCase(),
          class: selectedClass,
        })
      })
    })

    return Array.from(byKey.values()).sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    )
  }, [
    subjects,
    selectedClass,
    selectedExamId,
    selectedExam?.subjectKeys,
    selectedSection,
    requiresSection,
    timetableClasses,
  ])

  useEffect(() => {
    setSelectedClass('')
    setSelectedSection('')
    setRows([createEmptyRow()])
  }, [selectedExamId])

  useEffect(() => {
    setSelectedSection('')
    setRows([createEmptyRow()])
  }, [selectedClass])

  useEffect(() => {
    if (selectedExam && selectedClass) {
      setTitle(`${selectedExam.code} — Class ${selectedClass}`)
    }
  }, [selectedExam, selectedClass])

  useEffect(() => {
    if (!selectedExamId || !selectedClass) return
    if (requiresSection && !selectedSection) return
    if (filteredSubjects.length === 0) {
      setRows([createEmptyRow()])
      return
    }
    setRows(filteredSubjects.map((subject) => createEmptyRow(subject)))
  }, [selectedExamId, selectedClass, selectedSection, requiresSection, filteredSubjects])

  const canEditSubjects = Boolean(
    selectedExamId && selectedClass && (!requiresSection || selectedSection) && filteredSubjects.length > 0
  )

  const resetBuilder = () => {
    setSelectedExamId('')
    setSelectedClass('')
    setSelectedSection('')
    setTitle('')
    setRows([createEmptyRow()])
    setTried(false)
  }

  const addRow = () => {
    setRows((prev) => [...prev, createEmptyRow()])
  }

  const removeRow = (id: string) => {
    setRows((prev) => (prev.length === 1 ? prev : prev.filter((row) => row.id !== id)))
  }

  const updateRow = (id: string, patch: Partial<ScheduleRow>) => {
    setRows((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)))
  }

  const handleCreateDatesheet = async () => {
    setTried(true)
    if (!selectedExamId) {
      toast.error('Choose the exam this datesheet is for.')
      return
    }
    if (!selectedClass) {
      toast.error('Choose a class.')
      return
    }
    if (requiresSection && !selectedSection) {
      toast.error('Choose a section — Class 11 and 12 need one.')
      return
    }
    if (!title.trim()) {
      toast.error('Enter a title for the datesheet.')
      return
    }

    const invalidRow = rows.find((row) => !row.subjectId || !row.examDate || !row.start || !row.end || !row.duration)
    if (invalidRow) {
      toast.error('Every subject needs a date, start time, end time and duration.')
      return
    }

    const examDates = rows.map((row) => new Date(row.examDate))
    const startDate = new Date(Math.min(...examDates.map((date) => date.getTime()))).toISOString().slice(0, 10)
    const endDate = new Date(Math.max(...examDates.map((date) => date.getTime()))).toISOString().slice(0, 10)

    setSaving(true)
    try {
      const createRes = await datesheetService.create({
        title: title.trim(),
        examType: 'internal',
        examId: selectedExamId,
        class: selectedClass,
        section: requiresSection ? selectedSection : '',
        academicYear: toAcademicYear(currentSession),
        startDate,
        endDate,
        generalInstructions: [],
      })

      const createdId = createRes?.data?.data?.datesheet?._id
      if (!createdId) throw new Error('Failed to create datesheet')

      await datesheetService.update(createdId, {
        subjects: rows.map((row) => ({
          subject: row.subjectId,
          examDate: row.examDate,
          timeSlot: { start: row.start, end: row.end },
          duration: Number(row.duration),
          instructions: '',
          isOptional: false,
        })),
      })

      toast.success(`${title.trim()} saved.`)
      resetBuilder()
      await loadData()
    } catch (error) {
      toast.error(errorMessage(error, 'The datesheet wasn’t saved. Try again.'))
    } finally {
      setSaving(false)
    }
  }

  const subjectOptions = filteredSubjects.map((subject) => ({
    value: subject._id,
    label: subject.name || subject.code,
  }))

  const subjectName = (row: ScheduleRow) => filteredSubjects.find((s) => s._id === row.subjectId)?.name || 'this row'

  const visibleDatesheets = useMemo(() => {
    const needle = search.trim().toLowerCase()
    if (!needle) return savedDatesheets
    return savedDatesheets.filter((sheet) =>
      [sheet.title, sheet.class, sheet.section, getExamLabel(sheet)].some((v) =>
        String(v || '').toLowerCase().includes(needle)
      )
    )
  }, [savedDatesheets, search])

  const scheduleColumns: DataTableColumn<ScheduleRow>[] = [
    {
      key: 'subject',
      header: 'Subject',
      mobile: 'title',
      interactive: true,
      render: (row) => (
        <Select
          className="ex-ds-subject"
          size="sm"
          aria-label="Subject"
          placeholder="Choose subject"
          value={row.subjectId}
          onChange={(event) => updateRow(row.id, { subjectId: event.target.value })}
          options={subjectOptions}
          error={tried && !row.subjectId ? 'Choose a subject' : undefined}
        />
      ),
    },
    {
      key: 'date',
      header: 'Date',
      interactive: true,
      render: (row) => (
        <TextField
          className="ex-ds-date"
          size="sm"
          type="date"
          aria-label={`Exam date for ${subjectName(row)}`}
          value={row.examDate}
          onChange={(event) => updateRow(row.id, { examDate: event.target.value })}
          error={tried && !row.examDate ? 'Pick a date' : undefined}
        />
      ),
    },
    {
      key: 'start',
      header: 'Starts',
      interactive: true,
      render: (row) => (
        <TextField
          className="ex-ds-time"
          size="sm"
          type="time"
          aria-label={`Start time for ${subjectName(row)}`}
          value={row.start}
          onChange={(event) => updateRow(row.id, { start: event.target.value })}
          error={tried && !row.start ? 'Set a time' : undefined}
        />
      ),
    },
    {
      key: 'end',
      header: 'Ends',
      interactive: true,
      render: (row) => (
        <TextField
          className="ex-ds-time"
          size="sm"
          type="time"
          aria-label={`End time for ${subjectName(row)}`}
          value={row.end}
          onChange={(event) => updateRow(row.id, { end: event.target.value })}
          error={tried && !row.end ? 'Set a time' : undefined}
        />
      ),
    },
    {
      key: 'duration',
      header: 'Duration',
      interactive: true,
      render: (row) => (
        <TextField
          className="ex-ds-minutes"
          size="sm"
          type="number"
          inputMode="numeric"
          min={30}
          suffix="min"
          aria-label={`Duration in minutes for ${subjectName(row)}`}
          value={row.duration}
          onChange={(event) => updateRow(row.id, { duration: Number(event.target.value || 0) })}
          error={tried && !row.duration ? 'Enter minutes' : undefined}
        />
      ),
    },
    {
      key: 'remove',
      header: '',
      headerLabel: 'Remove',
      align: 'right',
      width: 48,
      mobile: 'aside',
      interactive: true,
      render: (row) => (
        <Button
          variant="tertiary"
          size="sm"
          icon={Trash2}
          aria-label={`Remove ${subjectName(row)} from the schedule`}
          disabled={rows.length === 1}
          onClick={() => removeRow(row.id)}
        />
      ),
    },
  ]

  const savedColumns: DataTableColumn<SavedDatesheet>[] = [
    { key: 'title', header: 'Title', mobile: 'title', render: (sheet) => <span className="cb-strong">{sheet.title}</span> },
    {
      key: 'exam',
      header: 'Exam',
      mobile: 'subtitle',
      render: (sheet) => (getExamCode(sheet) ? <span className="ex-code">{getExamCode(sheet)}</span> : '—'),
    },
    {
      key: 'class',
      header: 'Class',
      mobile: 'aside',
      render: (sheet) => (
        <Badge tone="neutral" dot={false}>
          {sheet.class}
        </Badge>
      ),
    },
    {
      key: 'section',
      header: 'Section',
      render: (sheet) => (sheet.section?.trim() ? sheet.section : 'All sections'),
    },
    {
      key: 'subjects',
      header: 'Subjects',
      numeric: true,
      align: 'right',
      render: (sheet) => sheet.subjects?.length || 0,
    },
    { key: 'created', header: 'Created', render: (sheet) => formatDate(sheet.createdAt) },
  ]

  const previewSubjects = useMemo(
    () =>
      [...(previewing?.subjects || [])].sort(
        (a, b) => new Date(a.examDate || 0).getTime() - new Date(b.examDate || 0).getTime()
      ),
    [previewing]
  )

  const previewColumns: DataTableColumn<SavedDatesheet['subjects'][number]>[] = [
    {
      key: 'subject',
      header: 'Subject',
      mobile: 'title',
      render: (item) => <span className="cb-strong">{item.subject?.name || '—'}</span>,
    },
    { key: 'date', header: 'Date', mobile: 'aside', render: (item) => formatDate(item.examDate) },
    {
      key: 'time',
      header: 'Time',
      render: (item) =>
        item.timeSlot?.start && item.timeSlot?.end
          ? `${formatTime(item.timeSlot.start)} – ${formatTime(item.timeSlot.end)}`
          : '—',
    },
    {
      key: 'duration',
      header: 'Duration',
      numeric: true,
      align: 'right',
      render: (item) => (item.duration ? `${item.duration} min` : '—'),
    },
  ]

  const builderEmpty = !selectedExamId
    ? {
        title: 'Choose an exam to start',
        body: 'Pick the exam and class above. The subjects set for that exam load here so you can give each one a date and time.',
      }
    : !selectedClass
      ? { title: 'Choose a class', body: 'Subjects for this exam and class load once you pick the class.' }
      : requiresSection && !selectedSection
        ? { title: 'Choose a section', body: 'Class 11 and 12 get a datesheet per section.' }
        : {
            title: 'No subjects for this exam and class',
            body: 'Add the class’s subjects for this exam on the Subjects or Marks distribution page, then come back.',
          }

  return (
    <Page>
      <div className="cb-stack">
        <Card
          title="New datesheet"
          subtitle="Up to Class 10, one datesheet covers every section. Class 11 and 12 get one per section."
        >
          <div className="cb-form-grid">
            <Select
              label="Exam"
              required
              placeholder={examsLoading ? 'Loading exams…' : exams.length === 0 ? 'No exams yet' : 'Choose exam'}
              value={selectedExamId}
              onChange={(event) => setSelectedExamId(event.target.value)}
              disabled={examsLoading}
              options={exams.map((exam) => ({ value: exam._id, label: `${exam.code} · ${exam.name}` }))}
              hint={!examsLoading && exams.length === 0 ? 'Add exams on the Exams page first, then come back.' : undefined}
              error={tried && !selectedExamId && exams.length > 0 ? 'Choose the exam.' : undefined}
            />
            <Select
              label="Class"
              required
              placeholder={
                !selectedExamId ? 'Choose exam first' : classOptions.length === 0 ? 'No classes found' : 'Choose class'
              }
              value={selectedClass}
              onChange={(event) => setSelectedClass(event.target.value)}
              disabled={!selectedExamId}
              options={classOptions}
              hint={
                selectedExamId && classOptions.length === 0
                  ? 'Set up classes in Timetable → Classes, then come back.'
                  : selectedClass && !requiresSection
                    ? 'Shared by every section of this class.'
                    : undefined
              }
              error={tried && selectedExamId && !selectedClass ? 'Choose a class.' : undefined}
            />
            {requiresSection ? (
              <Select
                label="Section"
                required
                placeholder={selectedClass ? 'Choose section' : 'Choose class first'}
                value={selectedSection}
                onChange={(event) => setSelectedSection(event.target.value)}
                disabled={!selectedClass}
                options={sectionOptions}
                error={tried && !selectedSection ? 'Choose a section.' : undefined}
              />
            ) : null}
            <TextField
              label="Datesheet title"
              required
              className={requiresSection ? undefined : 'is-wide'}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Filled in from the exam and class"
              error={tried && !title.trim() ? 'Enter a title.' : undefined}
            />
          </div>
        </Card>

        <Card
          flush
          title="Subject schedule"
          subtitle={
            canEditSubjects
              ? `${rows.length} ${rows.length === 1 ? 'subject' : 'subjects'} · give each one a date and time`
              : undefined
          }
          action={
            <Button size="sm" icon={Plus} onClick={addRow} disabled={!canEditSubjects}>
              Add subject
            </Button>
          }
          footer={
            <div className="ex-ds-foot">
              {selectedExam && selectedClass ? (
                <span className="ex-ds-foot__note">
                  {selectedExam.code} · Class {selectedClass}
                  {requiresSection && selectedSection ? `-${selectedSection}` : ''}
                </span>
              ) : null}
              <Button
                variant="primary"
                icon={CalendarDays}
                loading={saving}
                disabled={!canEditSubjects}
                onClick={() => void handleCreateDatesheet()}
              >
                Save datesheet
              </Button>
            </div>
          }
        >
          {canEditSubjects ? (
            <DataTable
              className="ex-ds-schedule"
              caption="Subject schedule"
              columns={scheduleColumns}
              rows={rows}
              getRowKey={(row) => row.id}
            />
          ) : (
            <EmptyState compact icon={CalendarDays} title={builderEmpty.title} body={builderEmpty.body} />
          )}
        </Card>

        <Card flush title="Saved datesheets" subtitle="Internal exam datesheets for this session">
          <CardToolbar>
            <FilterBar
              search={{
                placeholder: 'Search title, exam or class',
                value: search,
                onChange: setSearch,
                label: 'Search datesheets',
              }}
              actions={
                <Button icon={RefreshCw} onClick={() => void loadData()} loading={loading && savedDatesheets.length > 0}>
                  Refresh
                </Button>
              }
            />
          </CardToolbar>
          <DataTable
            caption="Saved datesheets"
            columns={savedColumns}
            rows={visibleDatesheets}
            getRowKey={(sheet) => sheet._id}
            onRowClick={setPreviewing}
            loading={loading}
            loadingLabel="Loading datesheets…"
            empty={
              savedDatesheets.length === 0 ? (
                <EmptyState
                  icon={CalendarDays}
                  title="No datesheets yet"
                  body="Choose an exam and class above, set each subject’s date and time, then save."
                />
              ) : (
                <EmptyState
                  compact
                  icon={CalendarDays}
                  title="No datesheets match this search"
                  action={
                    <Button size="sm" onClick={() => setSearch('')}>
                      Clear search
                    </Button>
                  }
                />
              )
            }
          />
        </Card>
      </div>

      <Sheet
        open={Boolean(previewing)}
        onClose={() => setPreviewing(null)}
        title={previewing?.title || 'Datesheet'}
        description={previewing ? getExamLabel(previewing) : undefined}
        icon={CalendarDays}
        size="lg"
        footer={<Button onClick={() => setPreviewing(null)}>Close</Button>}
      >
        {previewing ? (
          <div className="ex-ds-preview">
            <DetailList
              items={[
                { label: 'Class', value: previewing.class },
                { label: 'Section', value: previewing.section?.trim() ? previewing.section : 'All sections' },
                { label: 'Subjects', value: previewing.subjects?.length || 0 },
                { label: 'Created', value: formatDate(previewing.createdAt) },
              ]}
            />
            <DataTable
              caption="Subjects on this datesheet"
              columns={previewColumns}
              rows={previewSubjects}
              getRowKey={(item) => item._id || `${item.subject?._id}-${item.examDate}`}
              empty={<EmptyState compact icon={CalendarDays} title="No subjects on this datesheet" />}
            />
          </div>
        ) : null}
      </Sheet>
    </Page>
  )
}

export default ExmclDatesheets
