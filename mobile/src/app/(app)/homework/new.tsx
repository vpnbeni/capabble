import { useLocalSearchParams, usePreventRemove, useRouter } from 'expo-router'
import { useRef, useState } from 'react'
import { View } from 'react-native'

import { ApiError } from '@/lib/api'
import { classLabel, dayKeyAdd, formatDayKey, schoolToday } from '@/lib/format'
import { CardSkeleton, LoadFailed } from '@/portal/states'
import type { WorkKind } from '@/services/homeworkService'
import { useAcademicOptions, useHomework, useSaveHomework } from '@/staff/queries'
import { WORK } from '@/staff/workUi'
import { useStaff } from '@/staff/useStaff'
import { space } from '@/theme/tokens'
import {
  ActionBar,
  ActionSheet,
  BottomSheet,
  Callout,
  ListGroup,
  MobileScreen,
  MobileTextField,
  MonthPicker,
  NavBar,
  OptionList,
  StatusView,
  Surface,
  haptic,
  useToast,
  type MobileTextFieldRef,
} from '@/ui'

type Sheet = 'class' | 'subject' | 'due' | null
type Form = { classKey: string; subjectName: string; title: string; dueDate: string; instructions: string; maxMarks: string }

const keyOf = (className: string, section: string) => `${className}|${section}`

/**
 * Post homework or set an assignment for one class (or edit one). New work is published at once;
 * editing keeps its status and its curriculum topics. The class list is the teacher's own; the
 * server checks it again. Quizzes are written with their questions on the website.
 */
export default function HomeworkFormScreen() {
  const router = useRouter()
  const toast = useToast()
  const staff = useStaff()
  const params = useLocalSearchParams<{ id?: string; className?: string; section?: string; kind?: WorkKind }>()
  const kind: Exclude<WorkKind, 'quiz'> = params.kind === 'assignment' ? 'assignment' : 'homework'
  const words = WORK[kind]
  const marked = kind === 'assignment'
  const editing = Boolean(params.id)
  const options = useAcademicOptions()
  const existing = useHomework(params.id, kind)
  const save = useSaveHomework(kind)
  const today = schoolToday()
  const titleRef = useRef<MobileTextFieldRef>(null)
  const marksRef = useRef<MobileTextFieldRef>(null)

  const [form, setForm] = useState<Form | null>(null)
  const [sheet, setSheet] = useState<Sheet>(null)
  const [errors, setErrors] = useState<{ title?: string; classKey?: string; subjectName?: string; maxMarks?: string; form?: string }>({})
  const [leaving, setLeaving] = useState<null | (() => void)>(null)
  const [done, setDone] = useState(false)

  // The form starts from the homework being edited, or the class it was opened from.
  const start: Form | null = editing
    ? existing.data
      ? {
          classKey: keyOf(existing.data.className, existing.data.section),
          subjectName: existing.data.subjectName,
          title: existing.data.title,
          dueDate: existing.data.dueDate,
          instructions: existing.data.instructions ?? '',
          maxMarks: existing.data.maxMarks ? String(existing.data.maxMarks) : '',
        }
      : null
    : {
        classKey: params.className && params.section ? keyOf(params.className, params.section) : '',
        subjectName: '',
        title: '',
        dueDate: dayKeyAdd(today, kind === 'assignment' ? 7 : 1),
        instructions: '',
        maxMarks: marked ? '20' : '',
      }
  const value = form ?? start
  const dirty = !done && form !== null
  const allowLeaving = usePreventRemove(dirty && !save.isPending, ({ repeat }) => setLeaving(() => repeat))
  const set = (patch: Partial<Form>) => value && setForm({ ...value, ...patch })

  const classes = (options.data?.classOptions ?? []).flatMap((entry) => entry.sections.map((section) => ({ className: entry.className, section })))
  const [className, section] = (value?.classKey ?? '').split('|')
  const subjects = [
    ...new Set((options.data?.subjects ?? []).filter((subject) => !subject.className || subject.className === className).map((subject) => subject.name)),
  ].sort((a, b) => a.localeCompare(b))

  const submit = async () => {
    if (!value) return
    const problems: typeof errors = {}
    if (!value.classKey) problems.classKey = 'Choose the class'
    if (!value.subjectName) problems.subjectName = 'Choose the subject'
    if (!value.title.trim()) problems.title = marked ? 'Enter a title, such as "Project: the water cycle"' : 'Enter what to do, such as "Exercise 4.2, questions 1 to 10"'
    const maxMarks = Number(value.maxMarks)
    if (marked && (!Number.isInteger(maxMarks) || maxMarks < 1 || maxMarks > 1000)) problems.maxMarks = 'Enter the maximum marks, from 1 to 1000'
    setErrors(problems)
    if (Object.keys(problems).length) {
      haptic.error()
      if (problems.title && !problems.classKey && !problems.subjectName) titleRef.current?.focus()
      else if (problems.maxMarks) marksRef.current?.focus()
      return
    }
    try {
      await save.mutateAsync({
        id: params.id,
        input: {
          title: value.title.trim(),
          teacherId: staff.user?.teacher ?? undefined,
          className,
          section,
          subjectName: value.subjectName,
          assignedDate: existing.data?.assignedDate || today,
          dueDate: value.dueDate,
          instructions: value.instructions.trim(),
          status: existing.data?.status ?? 'published',
          ...(marked ? { maxMarks } : {}),
          // The phone doesn't show curriculum topics: send them back so an edit keeps them.
          ...(existing.data?.curriculumId ? { curriculumId: existing.data.curriculumId, topicIds: existing.data.topicIds ?? [] } : {}),
        },
      })
      haptic.success()
      setDone(true)
      allowLeaving()
      toast(editing ? 'Changes saved' : `${kind === 'homework' ? 'Homework' : 'Assignment'} published for ${classLabel(className, section)}`)
      router.back()
    } catch (error) {
      haptic.error()
      setErrors({ form: error instanceof ApiError ? error.message : `The ${words.one} didn't save. Check your connection and try again.` })
    }
  }

  const loading = options.isPending || (editing && existing.isPending)
  const failed = options.isError ? options : editing && existing.isError ? existing : null

  return (
    <MobileScreen
      nav={<NavBar title={editing ? `Edit ${words.one}` : (words.post as string)} back={{ label: words.title, onPress: router.back }} />}
      actionBar={
        value && !loading && classes.length ? (
          <ActionBar
            icon={words.icon}
            summary={value.title.trim() || (editing ? words.title : `New ${words.one}`)}
            detail={`${value.classKey ? classLabel(className, section) : 'Choose a class'} · due ${formatDayKey(value.dueDate, { weekday: 'short' })}`}
            label={save.isPending ? 'Saving…' : editing ? 'Save changes' : kind === 'homework' ? 'Post homework' : 'Set assignment'}
            onPress={submit}
          />
        ) : undefined
      }
      overlay={
        <>
          <BottomSheet open={sheet !== null} onClose={() => setSheet(null)} title={sheet === 'class' ? 'Class' : sheet === 'subject' ? 'Subject' : 'Due date'}>
            {sheet === 'class' ? (
              <OptionList
                label="Class"
                value={value?.classKey ?? null}
                onChange={(classKey) => {
                  // A new class may not have the chosen subject.
                  set({ classKey, subjectName: '' })
                  setErrors((current) => ({ ...current, classKey: undefined }))
                  setSheet(null)
                }}
                options={classes.map((entry) => ({ value: keyOf(entry.className, entry.section), label: classLabel(entry.className, entry.section) }))}
              />
            ) : sheet === 'subject' ? (
              <OptionList
                label="Subject"
                value={value?.subjectName || null}
                onChange={(subjectName) => {
                  set({ subjectName })
                  setErrors((current) => ({ ...current, subjectName: undefined }))
                  setSheet(null)
                }}
                options={subjects.map((name) => ({ value: name, label: name }))}
              />
            ) : sheet === 'due' ? (
              <MonthPicker
                value={value?.dueDate ?? null}
                today={today}
                min={today}
                onChange={(dueDate) => {
                  set({ dueDate })
                  setSheet(null)
                }}
              />
            ) : null}
          </BottomSheet>
          <ActionSheet
            open={Boolean(leaving)}
            onClose={() => setLeaving(null)}
            title={`Discard this ${words.one}?`}
            message={editing ? 'Your changes are not saved.' : "It hasn't been posted yet."}
            actions={[{ label: 'Discard', tone: 'danger', onSelect: () => leaving?.() }]}
            cancelLabel="Keep editing"
          />
        </>
      }
    >
      {loading ? (
        <CardSkeleton rows={4} />
      ) : failed ? (
        <LoadFailed what={editing ? `This ${words.one}` : 'Your classes'} error={failed.error} onRetry={failed.refetch} />
      ) : !classes.length ? (
        <Surface padded={false}>
          <StatusView compact kind="empty" icon={words.icon} title={`No classes to set ${kind === 'homework' ? 'homework' : 'assignments'} for`} body="Classes you teach show here. Ask the office if one is missing." />
        </Surface>
      ) : value ? (
        <>
          {errors.form ? (
            <Callout tone="danger" title={`The ${words.one} wasn't saved`}>
              {errors.form}
            </Callout>
          ) : errors.classKey || errors.subjectName ? (
            <Callout tone="danger" title="Choose the class and subject">
              {[errors.classKey, errors.subjectName].filter(Boolean).join('. ')}
            </Callout>
          ) : null}
          <ListGroup
            items={[
              { title: 'Class', value: value.classKey ? classLabel(className, section) : 'Choose', onPress: () => setSheet('class') },
              { title: 'Subject', value: value.subjectName || 'Choose', onPress: () => (value.classKey ? setSheet('subject') : setSheet('class')) },
              { title: 'Due', value: formatDayKey(value.dueDate, { weekday: 'short' }), onPress: () => setSheet('due') },
            ]}
          />
          <View style={{ gap: space['space-4'] }}>
            <MobileTextField
              ref={titleRef}
              label={marked ? 'Assignment' : 'Homework'}
              value={value.title}
              onChangeText={(title) => set({ title })}
              error={errors.title}
              placeholder={marked ? 'Project: the water cycle' : 'Exercise 4.2, questions 1 to 10'}
              maxLength={200}
            />
            {marked ? (
              <MobileTextField
                ref={marksRef}
                label="Maximum marks"
                type="number"
                value={value.maxMarks}
                onChangeText={(text) => set({ maxMarks: text.replace(/[^0-9]/g, '') })}
                error={errors.maxMarks}
                maxLength={4}
              />
            ) : null}
            <MobileTextField
              label="Instructions (optional)"
              hint="Pages, what to bring, how to submit."
              value={value.instructions}
              onChangeText={(instructions) => set({ instructions })}
              multiline
              maxLength={8000}
            />
          </View>
        </>
      ) : null}
    </MobileScreen>
  )
}
