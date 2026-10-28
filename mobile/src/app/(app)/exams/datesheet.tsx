import { useLocalSearchParams, usePreventRemove, useRouter } from 'expo-router'
import { CalendarCheck, CalendarPlus, Ellipsis, Plus, Send } from 'lucide-react-native'
import { useMemo, useState } from 'react'
import { View } from 'react-native'

import { ApiError } from '@/lib/api'
import { classLabel, formatDayKey, formatTime, minutesBetween, schoolToday, shortClass } from '@/lib/format'
import { CardSkeleton, LoadFailed } from '@/portal/states'
import { subjectKey, type DatesheetPaper, type ExamDatesheet } from '@/services/examService'
import { useAddClassSubject, useClassSubjectChoices, useCreateDatesheet, useDatesheet, usePublishDatesheet, useRemoveDatesheet, useUpdateDatesheet } from '@/staff/examSetupQueries'
import { useClassSections, useExamDatesheets, useExams } from '@/staff/queries'
import { useStaff } from '@/staff/useStaff'
import { space } from '@/theme/tokens'
import {
  ActionBar,
  ActionSheet,
  BottomSheet,
  Callout,
  Dialog,
  ListGroup,
  MobileButton,
  MobileScreen,
  MobileTextField,
  MonthPicker,
  NavBar,
  OptionList,
  SlotPicker,
  StatusView,
  Surface,
  haptic,
  useToast,
} from '@/ui'

/** One paper while editing: the subject's id (empty until a timetable subject is added to the subject list) and name, the day and the times. */
type Paper = {
  key: string
  subjectId: string
  subjectName: string
  date: string
  start: string
  end: string
}
type Picker = 'fields' | 'subject' | 'date' | 'start' | 'end'

// Exam times every quarter hour from 7 am to 5 pm.
const TIMES = Array.from({ length: 41 }, (_, index) => {
  const minutes = 7 * 60 + index * 15
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
})

/** Classes 11 and 12 get a datesheet per section (streams differ); others one for the class. */
const needsSection = (className: string) => ['11', '12', 'xi', 'xii'].includes(shortClass(className).toLowerCase())

const academicYear = () => {
  const [year, month] = schoolToday().split('-').map(Number)
  const start = month >= 4 ? year : year - 1
  return `${start}-${start + 1}`
}

let nextKey = 0
const newKey = () => `paper-${(nextKey += 1)}`

const fromSheet = (sheet: ExamDatesheet): Paper[] =>
  sheet.subjects.map((entry) => ({
    key: newKey(),
    subjectId: typeof entry.subject === 'string' ? entry.subject : (entry.subject?._id ?? ''),
    subjectName: typeof entry.subject === 'string' ? 'Subject' : (entry.subject?.name ?? 'Subject'),
    date: String(entry.examDate ?? '').slice(0, 10),
    start: entry.timeSlot?.start ?? '',
    end: entry.timeSlot?.end ?? '',
  }))

const toServer = (papers: Paper[]): DatesheetPaper[] =>
  [...papers]
    .sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start))
    .map((paper) => ({
      subject: paper.subjectId,
      examDate: paper.date,
      timeSlot: { start: paper.start, end: paper.end },
      duration: minutesBetween(paper.start, paper.end),
      instructions: '',
      isOptional: false,
    }))

const samePapers = (a: Paper[], b: Paper[]) => JSON.stringify(toServer(a)) === JSON.stringify(toServer(b))

/**
 * One class's datesheet for an exam (the website's Datesheets page): its papers, each a subject on
 * a day with start and end times. A draft can be changed, published or deleted; a published one is
 * read only (the server refuses changes). A new one asks for the class first.
 */
export default function DatesheetScreen() {
  const router = useRouter()
  const toast = useToast()
  const staff = useStaff()
  const { examId, id } = useLocalSearchParams<{
    examId: string
    id?: string
  }>()
  const exams = useExams()
  const exam = exams.data?.find((row) => row._id === examId)
  const sheets = useExamDatesheets(staff.can('exam.setup.read'))
  const one = useDatesheet(id)
  const sheet = id ? one.data : undefined
  const canWrite = staff.canUse('exmcl_datesheets') && staff.can('exam.setup.write')
  const editable = canWrite && (!id || (sheet && sheet.status !== 'published'))
  const sections = useClassSections(true, !id && canWrite)

  const [className, setClassName] = useState('')
  const [section, setSection] = useState('')
  const [title, setTitle] = useState<string | null>(null)
  const [papers, setPapers] = useState<Paper[] | null>(null)
  const [editing, setEditing] = useState<Paper | null>(null)
  const [picker, setPicker] = useState<Picker>('fields')
  const [choosingClass, setChoosingClass] = useState<'class' | 'section' | null>(null)
  const [menu, setMenu] = useState(false)
  const [confirm, setConfirm] = useState<'publish' | 'delete' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [leaving, setLeaving] = useState<null | (() => void)>(null)
  const [done, setDone] = useState(false)

  const addSubject = useAddClassSubject()
  const create = useCreateDatesheet()
  const update = useUpdateDatesheet()
  const publish = usePublishDatesheet()
  const remove = useRemoveDatesheet()
  const busy = addSubject.isPending || create.isPending || update.isPending || publish.isPending || remove.isPending

  const forClass = sheet?.class ?? className
  const canAddSubjects = staff.can('core.subjects.write')
  const subjects = useClassSubjectChoices(forClass || undefined, staff.can('timetable.timetable.read'))
  const saved = useMemo(() => (sheet ? fromSheet(sheet) : []), [sheet])
  const list = papers ?? saved
  const dirty = id ? papers !== null && !samePapers(papers, saved) : Boolean(className || list.length)
  const allowLeaving = usePreventRemove(Boolean(editable) && dirty && !busy && !done, ({ repeat }) => setLeaving(() => repeat))

  const classNames = useMemo(() => [...new Set((sections.data ?? []).map((row) => row.className))], [sections.data])
  const sectionNames = useMemo(() => (sections.data ?? []).filter((row) => row.className === className).map((row) => row.section), [sections.data, className])
  const taken = useMemo(
    () => new Set((sheets.data ?? []).filter((row) => (typeof row.examId === 'string' ? row.examId : row.examId?._id) === examId).map((row) => `${row.class}|${row.section ?? ''}`)),
    [sheets.data, examId],
  )

  // The class's subjects, only those the exam covers when it names some (by name or code).
  const subjectOptions = useMemo(() => {
    const keys = new Set((exam?.subjectKeys ?? []).map(subjectKey))
    return subjects.data.filter((row) => !keys.size || keys.has(subjectKey(row.name)) || (row.code && keys.has(subjectKey(row.code))))
  }, [subjects.data, exam?.subjectKeys])

  const openPaper = (paper?: Paper) => {
    const last = list[list.length - 1]
    setEditing(
      paper ?? {
        key: newKey(),
        subjectId: '',
        subjectName: '',
        date: last?.date ?? schoolToday(),
        start: last?.start ?? '09:00',
        end: last?.end ?? '12:00',
      },
    )
    setPicker(paper ? 'fields' : 'subject')
  }

  const keepPaper = () => {
    if (!editing) return
    if (!editing.subjectName) return setPicker('subject')
    const next = list.some((paper) => paper.key === editing.key) ? list.map((paper) => (paper.key === editing.key ? editing : paper)) : [...list, editing]
    setPapers(next)
    setEditing(null)
  }

  const dropPaper = () => {
    if (!editing) return
    setPapers(list.filter((paper) => paper.key !== editing.key))
    setEditing(null)
  }

  const validate = () => {
    if (!id && !className) return 'Choose the class.'
    if (!id && needsSection(className) && !section) return `Choose a section: ${classLabel(className)} has a datesheet per section.`
    if (!id && taken.has(`${className}|${needsSection(className) ? section : ''}`)) return `${classLabel(className, needsSection(className) ? section : '')} already has a datesheet for this exam.`
    if (!list.length) return 'Add at least one paper.'
    const subjectsSeen = new Set<string>()
    for (const paper of list) {
      if (minutesBetween(paper.start, paper.end) <= 0) return `${paper.subjectName} ends before it starts.`
      if (subjectsSeen.has(paper.subjectName.toLowerCase())) return `${paper.subjectName} is on the datesheet twice.`
      subjectsSeen.add(paper.subjectName.toLowerCase())
    }
    return null
  }

  const save = async () => {
    const problem = validate()
    if (problem) {
      haptic.error()
      return setError(problem)
    }
    const dates = list.map((paper) => paper.date).sort()
    const klass = sheet?.class ?? className
    const sec = needsSection(className) ? section : ''
    const defaultTitle = `${exam?.name ?? 'Exam'} · ${classLabel(className, sec)}`
    let created: ExamDatesheet | null = null
    try {
      // Timetable subjects go on the school's subject list first: a datesheet points at those.
      const ready: Paper[] = []
      for (const paper of list) {
        if (paper.subjectId) ready.push(paper)
        else
          ready.push({
            ...paper,
            subjectId: (
              await addSubject.mutateAsync({
                name: paper.subjectName,
                className: klass,
              })
            )._id,
          })
      }
      setPapers(ready)
      if (id) {
        await update.mutateAsync({
          id,
          input: {
            startDate: dates[0],
            endDate: dates[dates.length - 1],
            subjects: toServer(ready),
          },
        })
      } else {
        created = await create.mutateAsync({
          sheet: {
            title: title?.trim() || defaultTitle,
            examId,
            class: className,
            section: sec,
            academicYear: academicYear(),
            startDate: dates[0],
            endDate: dates[dates.length - 1],
          },
          papers: toServer(ready),
        })
      }
      haptic.success()
      if (created) setDone(true)
      allowLeaving()
      setError(null)
      setPapers(null)
      toast(id ? 'Datesheet saved' : 'Datesheet saved as a draft')
      // A new one opens as itself, ready to publish.
      if (created)
        router.replace({
          pathname: '/exams/datesheet',
          params: { examId, id: created._id },
        })
    } catch (failure) {
      haptic.error()
      setError(failure instanceof ApiError ? failure.message : "The datesheet didn't save. Check your connection and try again.")
    }
  }

  const act = async (what: 'publish' | 'delete') => {
    if (!id) return
    try {
      if (what === 'publish') await publish.mutateAsync(id)
      else await remove.mutateAsync(id)
      haptic[what === 'publish' ? 'success' : 'medium']()
      setConfirm(null)
      toast(what === 'publish' ? 'Datesheet published' : 'Datesheet deleted')
      if (what === 'delete') router.back()
    } catch (failure) {
      haptic.error()
      setConfirm(null)
      setError(failure instanceof ApiError ? failure.message : "That didn't work. Try again.")
    }
  }

  const label = sheet ? classLabel(sheet.class, sheet.section) : className ? classLabel(className, needsSection(className) ? section : '') : 'New datesheet'
  const sorted = [...list].sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start))
  const loading = exams.isPending || (id ? one.isPending : false)

  const actionBar = !editable ? undefined : dirty ? (
    <ActionBar
      icon={CalendarCheck}
      summary={label}
      detail={`${list.length} ${list.length === 1 ? 'paper' : 'papers'}`}
      label={create.isPending || update.isPending ? 'Saving…' : id ? 'Save' : 'Save datesheet'}
      onPress={save}
    />
  ) : id && list.length ? (
    <ActionBar icon={Send} summary={label} detail="Draft: you can still change it" label="Publish" onPress={() => setConfirm('publish')} />
  ) : undefined

  const isSaved = Boolean(editing && list.some((paper) => paper.key === editing.key))

  const pickerBody = () => {
    if (!editing) return null
    switch (picker) {
      case 'subject':
        return subjects.isPending ? (
          <CardSkeleton rows={4} />
        ) : subjectOptions.length ? (
          <OptionList
            label="Subject"
            value={editing.subjectName.toLowerCase()}
            onChange={(value) => {
              const subject = subjectOptions.find((row) => row.name.toLowerCase() === value)
              if (subject)
                setEditing({
                  ...editing,
                  subjectId: subject.id ?? '',
                  subjectName: subject.name,
                })
              setPicker('fields')
            }}
            options={subjectOptions.map((row) => ({
              value: row.name.toLowerCase(),
              label: row.name,
              meta: row.id || canAddSubjects ? undefined : 'Not on the school’s subject list yet',
              disabled:
                (!row.id && !canAddSubjects) || (row.name.toLowerCase() !== editing.subjectName.toLowerCase() && list.some((paper) => paper.subjectName.toLowerCase() === row.name.toLowerCase())),
            }))}
          />
        ) : (
          <StatusView compact kind="empty" title="No subjects for this class" body={`Add ${classLabel(forClass)}’s subjects to the timetable or the school’s subject list first.`} />
        )
      case 'date':
        return (
          <MonthPicker
            value={editing.date}
            today={schoolToday()}
            onChange={(value) => {
              setEditing({ ...editing, date: value })
              setPicker('fields')
            }}
          />
        )
      case 'start':
      case 'end':
        return (
          <SlotPicker
            label={picker === 'start' ? 'Starts' : 'Ends'}
            value={picker === 'start' ? editing.start : editing.end}
            slots={TIMES.filter((time) => picker === 'start' || time > editing.start).map((time) => ({ value: time, label: formatTime(time) }))}
            onChange={(value) => {
              if (picker === 'start') {
                const length = Math.max(minutesBetween(editing.start, editing.end), 60)
                const endIndex = Math.min(TIMES.indexOf(value) + Math.round(length / 15), TIMES.length - 1)
                setEditing({ ...editing, start: value, end: TIMES[endIndex] })
              } else setEditing({ ...editing, end: value })
              setPicker('fields')
            }}
          />
        )
      default:
        return (
          <View style={{ gap: space['space-4'] }}>
            <ListGroup
              items={[
                {
                  title: 'Subject',
                  value: editing.subjectName || 'Choose',
                  onPress: () => setPicker('subject'),
                },
                {
                  title: 'Day',
                  value: formatDayKey(editing.date, { weekday: 'short' }),
                  onPress: () => setPicker('date'),
                },
                {
                  title: 'Starts',
                  value: formatTime(editing.start),
                  onPress: () => setPicker('start'),
                },
                {
                  title: 'Ends',
                  value: formatTime(editing.end),
                  onPress: () => setPicker('end'),
                },
              ]}
            />
            {isSaved ? <ListGroup items={[{ title: 'Remove paper', tone: 'danger', onPress: dropPaper }]} /> : null}
          </View>
        )
    }
  }

  const PICKER_TITLES: Record<Picker, string> = {
    fields: 'Paper',
    subject: 'Subject',
    date: 'Day',
    start: 'Starts',
    end: 'Ends',
  }

  return (
    <MobileScreen
      nav={
        <NavBar
          title={label}
          back={{ label: exam?.name ?? 'Exam', onPress: router.back }}
          actions={
            editable && id
              ? [
                  {
                    icon: Ellipsis,
                    label: 'More actions',
                    onPress: () => setMenu(true),
                  },
                ]
              : []
          }
        />
      }
      actionBar={actionBar}
      overlay={
        <>
          <BottomSheet
            open={Boolean(editing)}
            onClose={() => (picker === 'fields' ? setEditing(null) : setPicker('fields'))}
            title={editing?.subjectName && picker === 'fields' ? editing.subjectName : PICKER_TITLES[picker]}
            description={
              picker === 'fields' && editing ? `${minutesBetween(editing.start, editing.end) > 0 ? `${minutesBetween(editing.start, editing.end)} minutes` : 'Ends before it starts'}` : undefined
            }
            footer={
              picker === 'fields' ? (
                <MobileButton fullWidth onPress={keepPaper}>
                  {isSaved ? 'Done' : 'Add paper'}
                </MobileButton>
              ) : undefined
            }
          >
            {pickerBody()}
          </BottomSheet>
          <BottomSheet open={Boolean(choosingClass)} onClose={() => setChoosingClass(null)} title={choosingClass === 'section' ? 'Section' : 'Class'}>
            {choosingClass === 'section' ? (
              <OptionList
                label="Section"
                value={section}
                onChange={(value) => {
                  setSection(value)
                  setChoosingClass(null)
                }}
                options={sectionNames.map((value) => ({
                  value,
                  label: classLabel(className, value),
                  disabled: taken.has(`${className}|${value}`),
                }))}
              />
            ) : sections.isPending ? (
              <CardSkeleton rows={4} />
            ) : (
              <OptionList
                label="Class"
                value={className}
                onChange={(value) => {
                  if (value !== className) {
                    setPapers(null)
                    setSection('')
                    setTitle(null)
                  }
                  setClassName(value)
                  setChoosingClass(null)
                }}
                options={classNames.map((value) => ({
                  value,
                  label: classLabel(value),
                  disabled: !needsSection(value) && taken.has(`${value}|`),
                }))}
              />
            )}
          </BottomSheet>
          <ActionSheet
            open={menu}
            onClose={() => setMenu(false)}
            title={label}
            actions={[
              {
                label: 'Delete draft',
                tone: 'danger',
                onSelect: () => (setMenu(false), setConfirm('delete')),
              },
            ]}
          />
          <Dialog
            open={Boolean(confirm)}
            onClose={() => setConfirm(null)}
            tone={confirm === 'delete' ? 'danger' : 'default'}
            title={confirm === 'delete' ? `Delete ${label}'s datesheet?` : `Publish ${label}'s datesheet?`}
            description={confirm === 'delete' ? 'The draft and its papers are removed.' : 'Once published it is final: nobody can change it.'}
            footer={
              <>
                <MobileButton variant="gray" onPress={() => setConfirm(null)}>
                  Not now
                </MobileButton>
                <MobileButton variant={confirm === 'delete' ? 'destructive' : 'filled'} loading={publish.isPending || remove.isPending} onPress={() => confirm && act(confirm)}>
                  {confirm === 'delete' ? 'Delete' : 'Publish'}
                </MobileButton>
              </>
            }
          />
          <ActionSheet
            open={Boolean(leaving)}
            onClose={() => setLeaving(null)}
            title="Discard your changes?"
            actions={[{ label: 'Discard', tone: 'danger', onSelect: () => leaving?.() }]}
            cancelLabel="Keep editing"
          />
        </>
      }
    >
      {loading ? (
        <CardSkeleton rows={5} />
      ) : !exam || (id && !sheet) ? (
        <LoadFailed what="The datesheet" error={exams.error ?? one.error} onRetry={() => (exams.refetch(), one.refetch())} />
      ) : (
        <>
          {error ? (
            <Callout tone="danger" title="Not saved">
              {error}
            </Callout>
          ) : null}
          {sheet?.status === 'published' ? (
            <Callout tone="info" title="Published">
              A published datesheet can’t be changed.
            </Callout>
          ) : null}

          {!id ? (
            <>
              <ListGroup
                header="For"
                items={[
                  {
                    title: 'Class',
                    value: className ? classLabel(className) : 'Choose',
                    onPress: () => setChoosingClass('class'),
                  },
                  ...(className && needsSection(className)
                    ? [
                        {
                          title: 'Section',
                          value: section || 'Choose',
                          onPress: () => setChoosingClass('section'),
                        },
                      ]
                    : []),
                ]}
              />
              {className ? (
                <MobileTextField label="Title" value={title ?? `${exam.name} · ${classLabel(className, needsSection(className) ? section : '')}`} onChangeText={setTitle} maxLength={120} />
              ) : null}
            </>
          ) : null}

          {id || className ? (
            <ListGroup
              header="Papers"
              footer={editable && !sorted.length ? 'Add each subject with its day and times.' : undefined}
              items={[
                ...sorted.map((paper) => ({
                  title: paper.subjectName,
                  subtitle: `${formatDayKey(paper.date, { weekday: 'short' })} · ${formatTime(paper.start)} to ${formatTime(paper.end)}`,
                  lines: 2 as const,
                  chevron: Boolean(editable),
                  onPress: editable ? () => openPaper(paper) : undefined,
                })),
                ...(editable
                  ? [
                      {
                        title: 'Add a paper',
                        icon: Plus,
                        tile: 6 as const,
                        onPress: () => openPaper(),
                      },
                    ]
                  : []),
              ]}
            />
          ) : (
            <Surface padded={false}>
              <StatusView compact kind="empty" icon={CalendarPlus} title="Choose the class" body={`Then add each paper of ${exam.name} with its day and times.`} />
            </Surface>
          )}
        </>
      )}
    </MobileScreen>
  )
}
