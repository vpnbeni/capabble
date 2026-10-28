import { useLocalSearchParams, useRouter } from 'expo-router'
import { FileText, Printer } from 'lucide-react-native'
import { useMemo, useState } from 'react'

import { ApiError } from '@/lib/api'
import { classLabel, formatDate } from '@/lib/format'
import { sharePdf } from '@/lib/sharePdf'
import { CardSkeleton, LoadFailed } from '@/portal/states'
import { examService, type ExamDatesheet } from '@/services/examService'
import { useDatesheet } from '@/staff/examSetupQueries'
import { useClassSections, useExamDatesheets, useExams, type ClassSection } from '@/staff/queries'
import { useStaff } from '@/staff/useStaff'
import { BottomSheet, ListGroup, MobileScreen, NavBar, OptionList, StatusView, Surface, haptic, useToast } from '@/ui'

type Kind = 'admit' | 'award' | 'report'

const KINDS: Record<Kind, { label: string; meta: string; file: string }> = {
  admit: { label: 'Admit cards', meta: 'One for each student, in the school’s design', file: 'Admit cards' },
  award: { label: 'Award list', meta: 'A sheet to write marks on, for one subject', file: 'Award list' },
  report: { label: 'Report cards', meta: 'Every student’s report card for this exam', file: 'Report cards' },
}

const fileName = (...parts: string[]) => `${parts.join(' ').replace(/[^a-zA-Z0-9 ._-]+/g, '-').replace(/\s+/g, ' ').trim()}.pdf`

const sheetExamId = (sheet: ExamDatesheet) => (typeof sheet.examId === 'string' ? sheet.examId : sheet.examId?._id)

/**
 * Printing for one exam (the website's Admit cards, Award list and Report card pages): choose what,
 * then a class, and the PDF opens in the share sheet (print, save to Files, WhatsApp). Designs are
 * set on the website; "own classes only" logins see their classes.
 */
export default function ExamPrintScreen() {
  const router = useRouter()
  const toast = useToast()
  const staff = useStaff()
  const { id } = useLocalSearchParams<{ id: string }>()
  const exams = useExams()
  const exam = exams.data?.find((row) => row._id === id)
  const sheets = useExamDatesheets(staff.can('exam.setup.read'))

  const allowed = useMemo(() => {
    const kinds: Kind[] = []
    if (staff.canUse('exmcl_admit_cards') && staff.can('exam.setup.write')) kinds.push('admit')
    if (staff.canUse('exmcl_award_list') && staff.can('exam.results.read')) kinds.push('award')
    if (staff.canUse('exmcl_report_card') && staff.can('exam.results.read')) kinds.push('report')
    return kinds
  }, [staff])
  const [picked, setPicked] = useState<Kind | null>(null)
  const kind = picked ?? allowed[0] ?? null
  const wholeSchool = kind === 'admit' || staff.scopeOf('exam.results.read') === 'all'
  const sections = useClassSections(wholeSchool, Boolean(kind))
  const [making, setMaking] = useState<string | null>(null)
  const [awardFor, setAwardFor] = useState<ClassSection | null>(null)

  // A class's datesheet for this exam (its section's, or the class-wide one), for the award list's subject.
  const sheetOf = (row: ClassSection) => {
    const own = (sheets.data ?? []).filter((sheet) => sheetExamId(sheet) === id && sheet.class === row.className)
    return own.find((entry) => entry.section === row.section) ?? own.find((entry) => !entry.section)
  }

  const make = async (row: ClassSection, what: Kind, subject = '', examDate = '') => {
    if (!exam || making) return
    const key = `${row.className}|${row.section}`
    setMaking(key)
    try {
      const bytes =
        what === 'admit'
          ? await examService.admitCards(exam._id, row.className, row.section)
          : what === 'award'
            ? await examService.awardList(exam._id, row.className, row.section, subject, examDate)
            : await examService.reportCards(exam._id, row.className, row.section)
      haptic.success()
      await sharePdf(bytes, fileName(KINDS[what].file, exam.code || exam.name, classLabel(row.className, row.section), subject))
    } catch (error) {
      haptic.error()
      toast(error instanceof ApiError ? error.message : `${KINDS[what].label} didn't download. Try again.`, 'danger')
    } finally {
      setMaking(null)
    }
  }

  const awardSheet = useDatesheet(awardFor ? sheetOf(awardFor)?._id : undefined)
  const awardPapers = awardFor && awardSheet.data ? [...awardSheet.data.subjects].sort((a, b) => a.examDate.localeCompare(b.examDate)) : []

  return (
    <MobileScreen
      refreshing={sections.isRefetching}
      onRefresh={sections.refetch}
      nav={<NavBar title="Print" back={{ label: exam?.name ?? 'Exam', onPress: router.back }} />}
      overlay={
        <BottomSheet open={Boolean(awardFor)} onClose={() => setAwardFor(null)} title="Award list for" description={awardFor ? classLabel(awardFor.className, awardFor.section) : undefined}>
          <OptionList
            label="Subject"
            value=""
            onChange={(value) => {
              const row = awardFor
              setAwardFor(null)
              if (!row) return
              const paper = awardPapers[Number(value)]
              const name = paper && typeof paper.subject === 'object' ? paper.subject?.name ?? '' : ''
              make(row, 'award', name, paper ? String(paper.examDate).slice(0, 10) : '')
            }}
            options={[
              ...awardPapers.map((paper, index) => ({
                value: String(index),
                label: typeof paper.subject === 'object' ? paper.subject?.name ?? 'Subject' : 'Subject',
                meta: formatDate(paper.examDate),
              })),
              { value: 'blank', label: 'Without a subject', meta: 'Write the subject and date by hand' },
            ]}
          />
        </BottomSheet>
      }
    >
      {exams.isPending ? (
        <CardSkeleton rows={4} />
      ) : !exam ? (
        <LoadFailed what="The exam" error={exams.error} onRetry={exams.refetch} />
      ) : !kind ? (
        <Surface padded={false}>
          <StatusView compact kind="permission" icon={Printer} title="Nothing to print" body="Your login can't print for this exam." />
        </Surface>
      ) : (
        <>
          {allowed.length > 1 ? (
            <OptionList
              header="What to print"
              label="What to print"
              value={kind}
              onChange={(value) => setPicked(value as Kind)}
              options={allowed.map((value) => ({ value, label: KINDS[value].label, meta: KINDS[value].meta }))}
            />
          ) : null}
          {sections.isPending ? (
            <CardSkeleton rows={5} />
          ) : sections.isError ? (
            <LoadFailed what="Classes" error={sections.error} onRetry={sections.refetch} />
          ) : sections.data?.length ? (
            <ListGroup
              header={`${KINDS[kind].label} · choose a class`}
              footer="The PDF opens in the share sheet: print it, save it or send it. Designs are set on the website."
              items={sections.data.map((row) => {
                const busy = making === `${row.className}|${row.section}`
                return {
                  title: classLabel(row.className, row.section),
                  subtitle: `${row.students} ${row.students === 1 ? 'student' : 'students'}`,
                  icon: FileText,
                  tile: 6,
                  value: busy ? 'Making…' : undefined,
                  chevron: !busy,
                  onPress: making ? undefined : () => (kind === 'award' ? setAwardFor(row) : make(row, kind)),
                }
              })}
            />
          ) : (
            <Surface padded={false}>
              <StatusView compact kind="empty" icon={FileText} title="No classes" body="Classes with students show here." />
            </Surface>
          )}
        </>
      )}
    </MobileScreen>
  )
}
