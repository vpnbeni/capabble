import React, { useEffect, useMemo, useState } from 'react'
import { Download, FileText, Settings2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { useNavigate } from 'react-router-dom'
import exmclExamService, { type ExmclExamDefinition } from '@/services/exmclExamService'
import exmclAwardListService, {
  DEFAULT_AWARD_LIST_DESIGN,
  type AwardListDesign,
} from '@/services/exmclAwardListService'
import schoolProfileService, { type SchoolProfile } from '@/services/schoolProfileService'
import api from '@/services/api'
import { sortSectionNames } from '@/constants/studentClasses'
import AwardListPreview, { type AwardListPreviewStudent } from '@/components/exmcl/AwardListPreview'
import { Button, Card, EmptyState, Page, Paper, PaperCopies, PaperStage, Select, TextField } from '@/components/ui'
import { CardLoading, errorMessage } from '@/components/exmcl/ExmclUi'
import '@/components/exmcl/award-list.css'

type ClassSectionEntry = {
  _id?: { class?: string; section?: string }
  count?: number
  active?: number
}

const sortClassNames = (left: string, right: string) =>
  left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' })

const formatDisplayDate = (value: string) => {
  const match = String(value || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (match) return `${match[3]}-${match[2]}-${match[1]}`
  return String(value || '').trim()
}

const ExmclAwardList: React.FC = () => {
  const navigate = useNavigate()
  const [exams, setExams] = useState<ExmclExamDefinition[]>([])
  const [classSectionEntries, setClassSectionEntries] = useState<ClassSectionEntry[]>([])
  const [design, setDesign] = useState<AwardListDesign>(DEFAULT_AWARD_LIST_DESIGN)
  const [school, setSchool] = useState<Partial<SchoolProfile>>({})
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [studentCount, setStudentCount] = useState<number | null>(null)
  const [previewStudents, setPreviewStudents] = useState<AwardListPreviewStudent[]>([])
  const [previewLoading, setPreviewLoading] = useState(false)

  const [selectedExamId, setSelectedExamId] = useState('')
  const [selectedClass, setSelectedClass] = useState('')
  const [selectedSection, setSelectedSection] = useState('')
  const [examDate, setExamDate] = useState('')
  const [subjectName, setSubjectName] = useState('')

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      setLoading(true)
      try {
        const [examList, statsRes, savedDesign, profile] = await Promise.all([
          exmclExamService.getAll(),
          api.get('/students/stats', { params: { lite: true } }),
          exmclAwardListService.getDesign(),
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
      } catch {
        if (!cancelled) toast.error('Exams and classes didn’t load. Check your connection and try again.')
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
      setPreviewStudents([])
      return
    }

    let cancelled = false
    setPreviewLoading(true)
    api
      .get('/students', {
        params: {
          page: 1,
          limit: 500,
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
        const students = Array.isArray(response?.data?.data?.students) ? response.data.data.students : []
        setStudentCount(Number(total) || 0)
        setPreviewStudents(
          students.map((student: any) => ({
            rollNumber: student.rollNumber || '',
            classRollNo: student.classRollNo || '',
            name: student.name || '',
            fatherName: student.fatherName || '',
          }))
        )
      })
      .catch(() => {
        if (!cancelled) {
          setStudentCount(null)
          setPreviewStudents([])
        }
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [selectedClass, selectedSection])

  const selectedExam = exams.find((exam) => exam._id === selectedExamId)
  const canGenerate = Boolean(selectedExamId && selectedClass && selectedSection)
  const twoUp = design.copiesPerSheet === 2
  const schoolName = String(school.name || '').trim() || 'SCHOOL NAME'
  const schoolAddress = String(school.address || '').trim()
  const previewSubjects = subjectName.trim() ? [subjectName.trim()] : ['Marks']

  const handleGenerate = async () => {
    if (!canGenerate) {
      toast.error('Select an exam, class and section.')
      return
    }

    setGenerating(true)
    try {
      await exmclAwardListService.downloadAwardList(
        selectedExamId,
        selectedClass,
        selectedSection,
        selectedExam?.code || 'exam',
        { subject: subjectName, examDate }
      )
      toast.success('Award list PDF downloaded.')
    } catch (error) {
      toast.error(errorMessage(error, 'The award list PDF wasn’t generated. Try again.'))
    } finally {
      setGenerating(false)
    }
  }

  const classLabel = selectedClass && selectedSection ? `Class ${selectedClass}-${selectedSection}` : ''
  const previewSubtitle =
    [selectedExam?.name, classLabel, subjectName.trim()].filter(Boolean).join(' · ') ||
    'Updates as you pick the exam and class.'

  const countLine = !(selectedClass && selectedSection) ? (
    'Pick an exam, class and section to generate its award list.'
  ) : previewLoading ? (
    'Counting students…'
  ) : studentCount === null ? (
    'Student count didn’t load. You can still download the PDF.'
  ) : (
    <>
      <strong>{studentCount}</strong> {studentCount === 1 ? 'student' : 'students'} in {classLabel}
    </>
  )

  return (
    <Page>
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          void handleGenerate()
        }}
      >
        <Card
          title="Generate award list"
          subtitle="A blank marks sheet for one class section, with every active student in roll order."
          action={
            <Button variant="tertiary" size="sm" icon={Settings2} onClick={() => navigate('/exmcl/performas/award-list')}>
              Change format
            </Button>
          }
          footer={
            <div className="ex-al-foot">
              <span className="ex-al-count" aria-live="polite">
                {countLine}
              </span>
              <Button
                type="submit"
                variant="primary"
                icon={Download}
                loading={generating}
                disabled={!canGenerate || loading}
              >
                {generating ? 'Preparing award list…' : 'Download award list'}
              </Button>
            </div>
          }
        >
          <div className="cb-form-grid cb-form-grid--3">
            <Select
              label="Exam"
              required
              value={selectedExamId}
              disabled={loading}
              placeholder={loading ? 'Loading exams…' : exams.length ? 'Choose exam' : 'No exams yet'}
              hint={!loading && exams.length === 0 ? 'Add an exam under Exams first.' : undefined}
              options={exams.map((exam) => ({ value: exam._id, label: `${exam.code} · ${exam.name}` }))}
              onChange={(event) => setSelectedExamId(event.target.value)}
            />
            <Select
              label="Class"
              required
              value={selectedClass}
              disabled={loading}
              placeholder="Choose class"
              options={classOptions}
              onChange={(event) => setSelectedClass(event.target.value)}
            />
            <Select
              label="Section"
              required
              value={selectedSection}
              disabled={loading || !selectedClass}
              placeholder={selectedClass ? 'Choose section' : 'Choose class first'}
              options={sectionOptions}
              onChange={(event) => setSelectedSection(event.target.value)}
            />
            {design.headerFields.subject ? (
              <TextField
                label="Subject"
                hint="Optional. Printed in the header."
                value={subjectName}
                onChange={(event) => setSubjectName(event.target.value)}
              />
            ) : null}
            {design.headerFields.date ? (
              <TextField
                label="Exam date"
                type="date"
                hint="Optional. Printed in the header."
                value={examDate}
                onChange={(event) => setExamDate(event.target.value)}
              />
            ) : null}
          </div>
        </Card>
      </form>

      <Card title="Preview" subtitle={previewSubtitle}>
        {loading ? (
          <CardLoading label="Loading award list format…" />
        ) : !canGenerate ? (
          <EmptyState
            icon={FileText}
            title="Nothing to preview yet"
            body="Pick an exam, class and section to see the award list as it will print."
          />
        ) : previewLoading ? (
          <CardLoading label="Loading students…" />
        ) : studentCount === 0 ? (
          <EmptyState
            title={`No active students in ${classLabel}`}
            body="Add students to this section, or pick another class."
          />
        ) : (
          <PaperStage>
            <Paper pageSize={design.pageSize || 'A4'} orientation={design.orientation || 'landscape'}>
              <PaperCopies count={twoUp ? 2 : 1}>
                <AwardListPreview
                  design={design}
                  compact={twoUp}
                  data={{
                    schoolName,
                    schoolAddress,
                    logoUrl: school.logoUrl,
                    className: selectedClass,
                    section: selectedSection,
                    examName: selectedExam?.name || '',
                    examDate: formatDisplayDate(examDate),
                    subject: subjectName,
                    maxMarks: selectedExam?.maximumMarks || '',
                    subjects: previewSubjects,
                    students: previewStudents,
                  }}
                />
              </PaperCopies>
            </Paper>
          </PaperStage>
        )}
      </Card>
    </Page>
  )
}

export default ExmclAwardList
