import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertCircle, ClipboardList, Download, FileText, Settings2, Users } from 'lucide-react'
import { Document, Page as PdfPage, pdfjs } from 'react-pdf'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import exmclExamService, { type ExmclExamDefinition } from '@/services/exmclExamService'
import exmclReportCardService from '@/services/exmclReportCardService'
import api from '@/services/api'
import { sortSectionNames } from '@/constants/studentClasses'
import { resolveApiBaseUrl } from '@/utils/tenantRuntime'
import {
  Avatar,
  BulkBar,
  Button,
  Card,
  CardToolbar,
  DataTable,
  EmptyState,
  Entity,
  FilterBar,
  PAPER_PAGES_CLASS,
  Page,
  Paper,
  PaperStage,
  Select,
  Sheet,
  useRowSelection,
  type DataTableColumn,
} from '@/components/ui'
import { CardLoading, errorMessage } from '@/components/exmcl/ExmclUi'
import '@/components/exmcl/exmcl.css'
import '@/components/exmcl/report-card.css'

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

type StudentRow = {
  _id: string
  rollNumber: string
  classRollNo?: number | null
  name: string
  class: string
  section: string
  fatherName?: string
  motherName?: string
  profileImage?: string | null
}

const SERVER_URL = resolveApiBaseUrl().replace('/api', '')

const getProfileImageUrl = (profileImage?: string | null) => {
  if (!profileImage) return null
  if (profileImage.startsWith('http')) return profileImage
  return `${SERVER_URL}${profileImage}`
}

type ClassSectionEntry = {
  _id?: { class?: string; section?: string }
  count?: number
  active?: number
}

const sortClassNames = (left: string, right: string) =>
  left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' })

const extractStudentList = (payload: any): StudentRow[] => {
  if (Array.isArray(payload?.data?.students)) return payload.data.students
  if (Array.isArray(payload?.students)) return payload.students
  if (Array.isArray(payload?.data)) return payload.data
  return []
}

const getStudentId = (student: StudentRow) => student._id

/** Width of each PDF page inside the preview sheet. */
const pdfPageWidth = () => (typeof window !== 'undefined' ? Math.max(260, Math.min(680, window.innerWidth - 72)) : 680)

const ExmclReportCard: React.FC = () => {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [reloadKey, setReloadKey] = useState(0)
  const [studentsLoading, setStudentsLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [exams, setExams] = useState<ExmclExamDefinition[]>([])
  const [classSectionEntries, setClassSectionEntries] = useState<ClassSectionEntry[]>([])
  const [students, setStudents] = useState<StudentRow[]>([])

  const [selectedExamId, setSelectedExamId] = useState('')
  const [selectedClass, setSelectedClass] = useState('')
  const [selectedSection, setSelectedSection] = useState('')

  const [downloadingIds, setDownloadingIds] = useState<Set<string>>(new Set())
  const [previewingIds, setPreviewingIds] = useState<Set<string>>(new Set())
  const [bulkDownloading, setBulkDownloading] = useState(false)
  const [previewStudent, setPreviewStudent] = useState<StudentRow | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewPageCount, setPreviewPageCount] = useState(0)
  const [previewRenderError, setPreviewRenderError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setLoadError(null)
      try {
        const [examList, statsRes] = await Promise.all([
          exmclExamService.getAll(),
          api.get('/students/stats', { params: { lite: true } }),
        ])
        if (cancelled) return
        const byClassSection = Array.isArray(statsRes?.data?.data?.byClassSection)
          ? statsRes.data.data.byClassSection
          : []
        setExams(examList)
        setClassSectionEntries(byClassSection)
        if (examList.length > 0) setSelectedExamId((prev) => prev || examList[0]._id)
      } catch (error) {
        if (cancelled) return
        const message = errorMessage(error, 'Exams and classes didn’t load. Check your connection and try again.')
        setLoadError(message)
        toast.error(message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [reloadKey])

  const populatedClassSections = useMemo(
    () =>
      classSectionEntries.filter((entry) => {
        const enrolled = Number(entry.active ?? entry.count)
        return Number.isFinite(enrolled) ? enrolled > 0 : Boolean(entry?._id?.class)
      }),
    [classSectionEntries]
  )

  const classOptions = useMemo(() => {
    const fromStudents = populatedClassSections
      .map((entry) => String(entry?._id?.class || '').trim())
      .filter(Boolean)
    return Array.from(new Set(fromStudents)).sort(sortClassNames)
  }, [populatedClassSections])

  const sectionOptions = useMemo(() => {
    if (!selectedClass) return []
    const classKey = selectedClass.trim().toLowerCase()
    return Array.from(
      new Set(
        populatedClassSections
          .filter((entry) => String(entry?._id?.class || '').trim().toLowerCase() === classKey)
          .map((entry) => String(entry?._id?.section || '').trim())
          .filter(Boolean)
      )
    ).sort((a, b) => sortSectionNames(a, b, selectedClass))
  }, [populatedClassSections, selectedClass])

  useEffect(() => {
    setSelectedSection('')
  }, [selectedClass])

  useEffect(() => {
    if (selectedClass && classOptions.length > 0 && !classOptions.includes(selectedClass)) {
      setSelectedClass('')
      setSelectedSection('')
    }
  }, [selectedClass, classOptions])

  useEffect(() => {
    if (selectedSection && sectionOptions.length > 0 && !sectionOptions.includes(selectedSection)) {
      setSelectedSection('')
    }
  }, [selectedSection, sectionOptions])

  useEffect(() => {
    if (!selectedClass || !selectedSection) {
      setStudents([])
      return
    }

    let cancelled = false
    setStudentsLoading(true)
    api
      .get('/students', {
        params: {
          page: 1,
          limit: 500,
          class: selectedClass,
          section: selectedSection,
          isActive: true,
          sort: 'classRollNo',
          lite: true,
        },
      })
      .then((response) => {
        if (cancelled) return
        setStudents(extractStudentList(response?.data))
      })
      .catch((error) => {
        if (cancelled) return
        setStudents([])
        toast.error(errorMessage(error, 'Students didn’t load. Pick the section again to retry.'))
      })
      .finally(() => {
        if (!cancelled) setStudentsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [selectedClass, selectedSection])

  const filteredStudents = useMemo(() => {
    return [...students].sort((a, b) => {
      const left = Number(a.classRollNo)
      const right = Number(b.classRollNo)
      const leftValid = Number.isFinite(left) && left > 0
      const rightValid = Number.isFinite(right) && right > 0
      if (leftValid && rightValid && left !== right) return left - right
      if (leftValid && !rightValid) return -1
      if (!leftValid && rightValid) return 1
      return String(a.name || '').localeCompare(String(b.name || ''), undefined, {
        sensitivity: 'base',
        numeric: true,
      })
    })
  }, [students])

  // Selection clears whenever the exam, class or section changes.
  const filterKey = `${selectedExamId}|${selectedClass}|${selectedSection}`
  const { selection, selectedIds, count: selectedCount, clear: clearSelection } = useRowSelection(
    filteredStudents,
    getStudentId,
    { resetKey: filterKey, rowLabel: (student) => `Select ${student.name}` }
  )

  const clearPreview = useCallback(() => {
    setPreviewStudent(null)
    setPreviewPageCount(0)
    setPreviewRenderError(null)
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return null
    })
  }, [])

  // Reset the preview when filters change.
  useEffect(() => {
    clearPreview()
  }, [selectedExamId, selectedClass, selectedSection, clearPreview])

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  const handleDownloadSingle = useCallback(
    async (student: StudentRow) => {
      if (!selectedExamId) return
      setDownloadingIds((prev) => new Set([...prev, student._id]))
      try {
        await exmclReportCardService.downloadSingle(selectedExamId, student._id, student.name)
      } catch (error) {
        toast.error(errorMessage(error, `${student.name}’s report card wasn’t generated. Try again.`))
      } finally {
        setDownloadingIds((prev) => {
          const next = new Set(prev)
          next.delete(student._id)
          return next
        })
      }
    },
    [selectedExamId]
  )

  const handlePreviewSingle = useCallback(
    async (student: StudentRow) => {
      if (!selectedExamId || previewingIds.has(student._id)) return
      setPreviewingIds((prev) => new Set([...prev, student._id]))
      setPreviewLoading(true)
      setPreviewStudent(student)
      setPreviewPageCount(0)
      setPreviewRenderError(null)
      try {
        const blob = await exmclReportCardService.fetchSinglePdfBlob(selectedExamId, student._id)
        const url = URL.createObjectURL(blob)
        setPreviewUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev)
          return url
        })
      } catch (error) {
        clearPreview()
        toast.error(errorMessage(error, `${student.name}’s report card couldn’t be previewed. Try again.`))
      } finally {
        setPreviewLoading(false)
        setPreviewingIds((prev) => {
          const next = new Set(prev)
          next.delete(student._id)
          return next
        })
      }
    },
    [selectedExamId, previewingIds, clearPreview]
  )

  const handleDownloadBulk = useCallback(async () => {
    if (!selectedExamId || !selectedClass || !selectedSection || selectedIds.length === 0) return
    setBulkDownloading(true)
    try {
      await exmclReportCardService.downloadBulk(selectedExamId, selectedClass, selectedSection, selectedIds)
    } catch (error) {
      toast.error(errorMessage(error, 'The report cards weren’t generated. Try again.'))
    } finally {
      setBulkDownloading(false)
    }
  }, [selectedExamId, selectedClass, selectedSection, selectedIds])

  const filtersComplete = Boolean(selectedExamId && selectedClass && selectedSection)
  const selectedExam = exams.find((exam) => exam._id === selectedExamId)
  const sectionLabel = selectedClass && selectedSection ? `Class ${selectedClass}-${selectedSection}` : ''

  const columns: DataTableColumn<StudentRow>[] = [
    {
      key: 'roll',
      header: 'Roll no.',
      width: 72,
      numeric: true,
      mobile: 'hidden',
      render: (student) => (student.classRollNo != null ? student.classRollNo : '—'),
    },
    {
      key: 'name',
      header: 'Student',
      mobile: 'title',
      render: (student) => (
        <div className="ex-rc-student">
          <Avatar name={student.name} src={getProfileImageUrl(student.profileImage)} size="sm" />
          <Entity
            primary={student.name}
            secondary={`Adm. no ${student.rollNumber || '—'}${
              student.classRollNo != null ? ` · Roll ${student.classRollNo}` : ''
            }`}
          />
        </div>
      ),
    },
    { key: 'father', header: 'Father’s name', render: (student) => student.fatherName || '—' },
    { key: 'mother', header: 'Mother’s name', render: (student) => student.motherName || '—' },
    {
      key: 'actions',
      header: '',
      headerLabel: 'Report card',
      align: 'right',
      interactive: true,
      mobile: 'aside',
      render: (student) => (
        <Button
          variant="tertiary"
          size="sm"
          icon={Download}
          loading={downloadingIds.has(student._id)}
          disabled={!selectedExamId}
          onClick={() => void handleDownloadSingle(student)}
          aria-label={`Download ${student.name}’s report card`}
        >
          {downloadingIds.has(student._id) ? 'Preparing…' : 'Download'}
        </Button>
      ),
    },
  ]

  const renderEmpty = () => {
    if (!selectedExamId) {
      return (
        <EmptyState
          icon={ClipboardList}
          title="Pick an exam"
          body="Report cards are generated for one exam at a time."
        />
      )
    }
    if (!selectedClass || !selectedSection) {
      return (
        <EmptyState
          icon={Users}
          title="Pick a class and section"
          body="Its students appear here, ready to preview or download."
        />
      )
    }
    return (
      <EmptyState
        icon={Users}
        title={`No active students in ${sectionLabel}`}
        body="Add students to this section, or pick another section."
      />
    )
  }

  const renderBody = () => {
    if (loadError) {
      return (
        <EmptyState
          icon={AlertCircle}
          title="Exams and classes didn’t load"
          body={loadError}
          action={
            <Button size="sm" onClick={() => setReloadKey((key) => key + 1)}>
              Try again
            </Button>
          }
        />
      )
    }
    if (!loading && exams.length === 0) {
      return (
        <EmptyState
          icon={ClipboardList}
          title="No exams set up for this session"
          body="Add the exams your school holds first. Report cards are generated per exam."
          action={
            <Button size="sm" onClick={() => navigate('/exmcl/exams')}>
              Set up exams
            </Button>
          }
        />
      )
    }
    return (
      <DataTable<StudentRow>
        caption={sectionLabel ? `Students in ${sectionLabel}` : 'Students'}
        columns={columns}
        rows={filtersComplete ? filteredStudents : []}
        getRowKey={getStudentId}
        onRowClick={(student) => void handlePreviewSingle(student)}
        selection={filtersComplete ? selection : undefined}
        loading={loading || studentsLoading}
        loadingLabel={loading ? 'Loading exams and classes…' : 'Loading students…'}
        maxHeight="70vh"
        empty={renderEmpty()}
        footer={
          filtersComplete && filteredStudents.length > 0 ? (
            <span className="is-num">
              {filteredStudents.length} student{filteredStudents.length !== 1 ? 's' : ''} · Select a student to preview
              their report card
            </span>
          ) : undefined
        }
      />
    )
  }

  const previewDescription = previewStudent
    ? [
        `Adm. no ${previewStudent.rollNumber || '—'}`,
        previewStudent.classRollNo != null ? `Roll ${previewStudent.classRollNo}` : null,
        selectedExam ? selectedExam.name : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : undefined

  return (
    <Page>
      <Card
        flush
        title="Report cards"
        subtitle="Pick an exam, class and section, then preview or download each student’s report card."
        action={
          <Button
            variant="tertiary"
            size="sm"
            icon={Settings2}
            onClick={() => navigate('/exmcl/performas/report-card')}
          >
            Change format
          </Button>
        }
      >
        <CardToolbar>
          <FilterBar
            filters={
              <>
                <Select
                  aria-label="Exam"
                  size="sm"
                  className="ex-rc-exam"
                  value={selectedExamId}
                  onChange={(e) => setSelectedExamId(e.target.value)}
                  disabled={loading}
                  placeholder={loading ? 'Loading exams…' : 'Choose exam'}
                  options={exams.map((exam) => ({ value: exam._id, label: `${exam.code} · ${exam.name}` }))}
                />
                <Select
                  aria-label="Class"
                  size="sm"
                  value={selectedClass}
                  onChange={(e) => setSelectedClass(e.target.value)}
                  disabled={loading}
                  placeholder="Choose class"
                  options={classOptions.map((className) => ({ value: className, label: `Class ${className}` }))}
                />
                <Select
                  aria-label="Section"
                  size="sm"
                  value={selectedSection}
                  onChange={(e) => setSelectedSection(e.target.value)}
                  disabled={loading || !selectedClass}
                  placeholder={selectedClass ? 'Choose section' : 'Choose class first'}
                  options={sectionOptions.map((section) => ({ value: section, label: `Section ${section}` }))}
                />
              </>
            }
          />
        </CardToolbar>
        {selectedCount > 0 ? (
          <div className="ex-rc-bulk">
            <BulkBar count={selectedCount} noun="student" onClear={clearSelection} busy={bulkDownloading}>
              <Button
                variant="primary"
                size="sm"
                icon={Download}
                loading={bulkDownloading}
                onClick={() => void handleDownloadBulk()}
              >
                {bulkDownloading
                  ? 'Preparing PDF…'
                  : `Download ${selectedCount} report card${selectedCount !== 1 ? 's' : ''}`}
              </Button>
            </BulkBar>
          </div>
        ) : null}
        {renderBody()}
      </Card>

      <Sheet
        open={Boolean(previewStudent)}
        onClose={clearPreview}
        size="xl"
        icon={FileText}
        title={previewStudent ? `${previewStudent.name}’s report card` : 'Report card'}
        description={previewDescription}
        footer={
          previewStudent ? (
            <>
              <Button onClick={clearPreview}>Close</Button>
              <Button
                variant="primary"
                icon={Download}
                loading={downloadingIds.has(previewStudent._id)}
                disabled={!selectedExamId}
                onClick={() => void handleDownloadSingle(previewStudent)}
              >
                Download report card
              </Button>
            </>
          ) : null
        }
      >
        <PaperStage
          state={
            previewLoading ? (
              <CardLoading label="Generating preview…" />
            ) : !previewUrl ? (
              <EmptyState compact icon={FileText} title="No preview yet" />
            ) : previewRenderError ? (
              <EmptyState
                icon={AlertCircle}
                title="The preview couldn’t be shown"
                body={`${previewRenderError} Download the report card to open it instead.`}
              />
            ) : undefined
          }
        >
          <Document
            file={previewUrl}
            className={PAPER_PAGES_CLASS}
            loading={<CardLoading label="Rendering preview…" />}
            onLoadSuccess={({ numPages }) => {
              setPreviewPageCount(numPages)
              setPreviewRenderError(null)
            }}
            onLoadError={(error) => {
              const message = (error as Error)?.message || 'Unknown PDF render error'
              setPreviewRenderError(`The PDF didn’t render (${message}).`)
            }}
          >
            {Array.from({ length: previewPageCount }).map((_, index) => (
              <Paper key={`report-card-preview-page-${index + 1}`}>
                <PdfPage
                  pageNumber={index + 1}
                  width={pdfPageWidth()}
                  renderTextLayer={false}
                  renderAnnotationLayer={false}
                />
              </Paper>
            ))}
          </Document>
        </PaperStage>
      </Sheet>
    </Page>
  )
}

export default ExmclReportCard
