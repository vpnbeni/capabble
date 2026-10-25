import { useLocalSearchParams, usePreventRemove, useRouter } from 'expo-router'
import { NotebookPen } from 'lucide-react-native'
import { useRef, useState } from 'react'
import { View } from 'react-native'

import { ApiError } from '@/lib/api'
import { classLabel, dayKeyAdd, formatDayKey, schoolToday } from '@/lib/format'
import { CardSkeleton, LoadFailed } from '@/portal/states'
import { useAcademicOptions, useHomework, useSaveHomework } from '@/staff/queries'
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
type Form = { classKey: string; subjectName: string; title: string; dueDate: string; instructions: string }

const keyOf = (className: string, section: string) => `${className}|${section}`

/**
 * Post homework for one class (or edit one). New homework is published at once; editing keeps
 * its status. The class list is the teacher's own; the server checks it again.
 */
export default function HomeworkFormScreen() {
  const router = useRouter()
  const toast = useToast()
  const staff = useStaff()
  const params = useLocalSearchParams<{ id?: string; className?: string; section?: string }>()
  const editing = Boolean(params.id)
  const options = useAcademicOptions()
  const existing = useHomework(params.id)
  const save = useSaveHomework()
  const today = schoolToday()
  const titleRef = useRef<MobileTextFieldRef>(null)

  const [form, setForm] = useState<Form | null>(null)
  const [sheet, setSheet] = useState<Sheet>(null)
  const [errors, setErrors] = useState<{ title?: string; classKey?: string; subjectName?: string; form?: string }>({})
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
        }
      : null
    : { classKey: params.className && params.section ? keyOf(params.className, params.section) : '', subjectName: '', title: '', dueDate: dayKeyAdd(today, 1), instructions: '' }
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
    if (!value.title.trim()) problems.title = 'Enter what to do, such as "Exercise 4.2, questions 1 to 10"'
    setErrors(problems)
    if (Object.keys(problems).length) {
      haptic.error()
      if (problems.title && !problems.classKey && !problems.subjectName) titleRef.current?.focus()
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
        },
      })
      haptic.success()
      setDone(true)
      allowLeaving()
      toast(editing ? 'Homework updated' : `Homework published for ${classLabel(className, section)}`)
      router.back()
    } catch (error) {
      haptic.error()
      setErrors({ form: error instanceof ApiError ? error.message : "The homework didn't save. Check your connection and try again." })
    }
  }

  const loading = options.isPending || (editing && existing.isPending)
  const failed = options.isError ? options : editing && existing.isError ? existing : null

  return (
    <MobileScreen
      nav={<NavBar title={editing ? 'Edit homework' : 'Post homework'} back={{ label: 'Homework', onPress: router.back }} />}
      actionBar={
        value && !loading && classes.length ? (
          <ActionBar
            icon={NotebookPen}
            summary={value.title.trim() || (editing ? 'Homework' : 'New homework')}
            detail={`${value.classKey ? classLabel(className, section) : 'Choose a class'} · due ${formatDayKey(value.dueDate, { weekday: 'short' })}`}
            label={save.isPending ? 'Saving…' : editing ? 'Save changes' : 'Post homework'}
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
            title="Discard this homework?"
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
        <LoadFailed what={editing ? 'This homework' : 'Your classes'} error={failed.error} onRetry={failed.refetch} />
      ) : !classes.length ? (
        <Surface padded={false}>
          <StatusView compact kind="empty" icon={NotebookPen} title="No classes to set homework for" body="Classes you teach show here. Ask the office if one is missing." />
        </Surface>
      ) : value ? (
        <>
          {errors.form ? (
            <Callout tone="danger" title="The homework wasn't saved">
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
              label="Homework"
              value={value.title}
              onChangeText={(title) => set({ title })}
              error={errors.title}
              placeholder="Exercise 4.2, questions 1 to 10"
              maxLength={200}
            />
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
