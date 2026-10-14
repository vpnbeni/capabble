import React, { useEffect, useMemo, useState } from 'react'
import { ClipboardList, Contact, Download, Settings2, Users } from 'lucide-react'
import toast from 'react-hot-toast'
import { useNavigate } from 'react-router-dom'
import exmclExamService, { type ExmclExamDefinition } from '@/services/exmclExamService'
import exmclAdmitCardService, {
  DEFAULT_ADMIT_CARD_DESIGN,
  type AdmitCardDesign,
} from '@/services/exmclAdmitCardService'
import schoolProfileService, { type SchoolProfile } from '@/services/schoolProfileService'
import api from '@/services/api'
import { sortSectionNames } from '@/constants/studentClasses'
import AdmitCardPreview, {
  type AdmitCardPreviewStudent,
  type AdmitCardPreviewSubject,
} from '@/components/exmcl/AdmitCardPreview'
import { Button, Card, CardToolbar, EmptyState, FilterBar, Page, Paper, PaperStage, Select } from '@/components/ui'
import { CardLoading, errorMessage } from '@/components/exmcl/ExmclUi'
import '@/components/exmcl/admit-cards.css'

type ClassSectionEntry = {
  _id?: { class?: string; section?: string }
  count?: number
  active?: number
}

const sortClassNames = (left: string, right: string) =>
  left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' })

/** Date of birth as the printed card shows it (24.10.2010). */
const formatCardDate = (value?: string | Date) => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  return `${day}.${month}.${date.getFullYear()}`
}

const ExmclAdmitCards: React.FC = () => {
  const navigate = useNavigate()
  const [exams, setExams] = useState<ExmclExamDefinition[]>([])
  const [classSectionEntries, setClassSectionEntries] = useState<ClassSectionEntry[]>([])
  const [design, setDesign] = useState<AdmitCardDesign>(DEFAULT_ADMIT_CARD_DESIGN)
  const [school, setSchool] = useState<Partial<SchoolProfile>>({})
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [studentCount, setStudentCount] = useState<number | null>(null)
  const [previewStudent, setPreviewStudent] = useState<AdmitCardPreviewStudent | null>(null)
  const [previewSubjects, setPreviewSubjects] = useState<AdmitCardPreviewSubject[]>([])
  const [previewLoading, setPreviewLoading] = useState(false)

  const [selectedExamId, setSelectedExamId] = useState('')
  const [selectedClass, setSelectedClass] = useState('')
  const [selectedSection, setSelectedSection] = useState('')

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      setLoading(true)
      try {
        const [examList, statsRes, savedDesign, profile] = await Promise.all([
          exmclExamService.getAll(),
          api.get('/students/stats', { params: { lite: true } }),
          exmclAdmitCardService.getDesign(),
          schoolProfileService.getProfile().catch(() => null),
        ])
        if (cancelled) return

        const byClassSection = Array.isArray(statsRes?.data?.data?.byClassSection)
          ? statsRes.data.data.byClassSection
          : []

        setExams(examList)
        setClassSectionEntries(byClassSection)
        setDesign(savedDesign)
        if (profile) setSchool(profile)
        if (examList.length > 0) setSelectedExamId(examList[0]._id)
      } catch (error) {
        if (!cancelled) toast.error(errorMessage(error, 'Exams and classes didn’t load. Check your connection and refresh the page.'))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [])

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
    return Array.from(
      new Set(
        populatedClassSections
          .filter((entry) => String(entry?._id?.class || '').trim() === selectedClass)
          .map((entry) => String(entry?._id?.section || '').trim())
          .filter(Boolean)
      )
    ).sort((a, b) => sortSectionNames(a, b, selectedClass))
  }, [populatedClassSections, selectedClass])

  useEffect(() => {
    setSelectedSection('')
  }, [selectedClass])

  useEffect(() => {
    if (!selectedClass || !selectedSection) {
      setStudentCount(null)
      setPreviewStudent(null)
      setPreviewSubjects([])
      return
    }

    let cancelled = false
    setPreviewLoading(true)
    api
      .get('/students', {
        params: {
          page: 1,
          limit: 1,
          class: selectedClass,
          section: selectedSection,
          isActive: true,
          sort: 'classRollNo',
        },
      })
      .then((response) => {
        if (cancelled) return
        const total =
          response?.data?.data?.pagination?.totalItems ??
          response?.data?.data?.pagination?.totalCount ??
          0
        setStudentCount(Number(total) || 0)
        const student = Array.isArray(response?.data?.data?.students)
          ? response.data.data.students[0]
          : null
        if (!student) {
          setPreviewStudent(null)
          setPreviewSubjects([])
          return
        }

        const examCode = exams.find((exam) => exam._id === selectedExamId)?.code || 'EXM'
        setPreviewStudent({
          name: student.name || '',
          fatherName: student.fatherName || '',
          gender: student.gender && student.gender !== 'Unspecified' ? student.gender : '',
          motherName: student.motherName || '',
          className: student.class || selectedClass,
          section: student.section || selectedSection,
          rollNo: student.classRollNo || '',
          admissionNo: student.rollNumber || '',
          dateOfBirth: formatCardDate(student.dateOfBirth),
          photoUrl: student.profileImage || '',
          pwdCategory: String(student.medicalInfo?.specialNeeds || '').trim() || 'Not Applicable',
          admitCardId: `AC${String(examCode).replace(/\s+/g, '')}${String(student.rollNumber || student._id).slice(-6)}`.toUpperCase(),
        })
        setPreviewSubjects(
          (Array.isArray(student.subjects) ? student.subjects : [])
            .map((subject: { code?: string; name?: string }) => ({
              code: String(subject?.code || ''),
              name: String(subject?.name || '').toUpperCase(),
            }))
            .filter((subject: AdmitCardPreviewSubject) => subject.name)
        )
      })
      .catch(() => {
        if (!cancelled) {
          setStudentCount(null)
          setPreviewStudent(null)
          setPreviewSubjects([])
        }
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [selectedClass, selectedSection, selectedExamId, exams])

  const selectedExam = exams.find((exam) => exam._id === selectedExamId)
  const canGenerate = Boolean(selectedExamId && selectedClass && selectedSection)
  const twoUp = design.copiesPerSheet === 2
  const schoolName = String(school.name || '').trim() || 'SCHOOL NAME'
  const schoolAddress = String(school.address || '').trim()
  const schoolCode = String(school.schoolCode || '').trim()

  const sectionLabel = selectedClass && selectedSection ? `Class ${selectedClass}-${selectedSection}` : ''

  const handleGenerate = async () => {
    if (!canGenerate) {
      toast.error('Choose an exam, class and section first.')
      return
    }

    setGenerating(true)
    try {
      await exmclAdmitCardService.downloadAdmitCards(
        selectedExamId,
        selectedClass,
        selectedSection,
        selectedExam?.code || 'exam'
      )
      toast.success(`Admit cards for ${sectionLabel} downloaded.`)
    } catch (error) {
      toast.error(errorMessage(error, 'Admit cards didn’t download. Try again in a moment.'))
    } finally {
      setGenerating(false)
    }
  }

  const previewSubtitle = !canGenerate
    ? 'Choose an exam, class and section to see the first student’s card.'
    : previewLoading
      ? 'Loading students…'
      : studentCount === null
        ? 'The student count didn’t load. Choose the section again to retry.'
        : [selectedExam?.name, sectionLabel, previewStudent?.name].filter(Boolean).join(' · ')

  const downloadLabel =
    canGenerate && studentCount
      ? `Download ${studentCount} admit card${studentCount === 1 ? '' : 's'}`
      : 'Download admit cards'

  const renderStage = () => {
    if (loading) return <CardLoading label="Loading exams and classes…" />
    if (exams.length === 0) {
      return (
        <EmptyState
          icon={ClipboardList}
          title="No exams yet"
          body="Add an exam first, then come back to print its admit cards."
          action={
            <Button variant="secondary" onClick={() => navigate('/exmcl/exams')}>
              Add exam
            </Button>
          }
        />
      )
    }
    if (!canGenerate) {
      return (
        <EmptyState
          icon={Contact}
          title="No class chosen"
          body="Choose an exam, class and section above to preview the admit card."
        />
      )
    }
    if (previewLoading) return <CardLoading label="Loading preview…" />
    if (studentCount === 0) {
      return (
        <EmptyState
          icon={Users}
          title={`No active students in ${sectionLabel}`}
          body="Add students to this section, or choose another section."
        />
      )
    }
    return (
      <PaperStage flush>
        <Paper pageSize={design.pageSize || 'A4'} orientation={design.orientation || 'portrait'}>
          <AdmitCardPreview
            design={design}
            compact={twoUp}
            data={{
              schoolName,
              schoolAddress,
              schoolCode,
              logoUrl: school.logoUrl,
              examName: selectedExam?.name || 'EXAMINATION',
              student: previewStudent || {
                className: selectedClass,
                section: selectedSection,
              },
              subjects: previewSubjects,
            }}
          />
        </Paper>
      </PaperStage>
    )
  }

  return (
    <Page>
      <Card
        flush
        title="Preview"
        subtitle={previewSubtitle}
        action={
          <Button variant="tertiary" size="sm" icon={Settings2} onClick={() => navigate('/exmcl/performas/admit-card')}>
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
                  className="ex-ac-exam"
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
            actions={
              <Button
                variant="primary"
                size="sm"
                icon={Download}
                onClick={handleGenerate}
                disabled={!canGenerate}
                loading={generating}
              >
                {generating ? 'Preparing PDF…' : downloadLabel}
              </Button>
            }
          />
        </CardToolbar>
        {renderStage()}
      </Card>
    </Page>
  )
}

export default ExmclAdmitCards
