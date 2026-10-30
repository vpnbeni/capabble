import { useLocalSearchParams, usePreventRemove, useRouter } from 'expo-router'
import { ListChecks } from 'lucide-react-native'
import { useMemo, useState } from 'react'

import { ApiError } from '@/lib/api'
import { CardSkeleton, LoadFailed } from '@/portal/states'
import { subjectKey } from '@/services/examService'
import { useSetExamSubjects, useSubjectNames } from '@/staff/examSetupQueries'
import { useExams } from '@/staff/queries'
import { useStaff } from '@/staff/useStaff'
import { ActionBar, ActionSheet, Callout, MobileScreen, NavBar, OptionList, SearchBar, haptic, useToast } from '@/ui'

const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((key) => b.includes(key))

/** "social-science" → "Social science", for a saved subject the school's list no longer has. */
const fromKey = (key: string) => {
  const words = key.replace(/-/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/**
 * Which subjects an exam covers (the website's exam subjects grid, one exam at a time). None
 * chosen means every subject of each class. Saving changes only this exam.
 */
export default function ExamSubjectsScreen() {
  const router = useRouter()
  const toast = useToast()
  const { id } = useLocalSearchParams<{ id: string }>()
  const exams = useExams()
  const exam = exams.data?.find((row) => row._id === id)
  const staff = useStaff()
  const names = useSubjectNames(staff.can('timetable.timetable.read'))
  const save = useSetExamSubjects()
  const [chosen, setChosen] = useState<string[] | null>(null)
  const [search, setSearch] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [leaving, setLeaving] = useState<null | (() => void)>(null)

  const saved = useMemo(() => (exam?.subjectKeys ?? []).map(subjectKey), [exam?.subjectKeys])
  const value = chosen ?? saved
  const dirty = chosen !== null && !sameSet(chosen, saved)
  const allowLeaving = usePreventRemove(dirty && !save.isPending, ({ repeat }) => setLeaving(() => repeat))

  const options = useMemo(() => {
    const byKey = new Map<string, string>()
    ;(names.data ?? []).forEach((name) => byKey.set(subjectKey(name), name))
    saved.forEach((key) => !byKey.has(key) && byKey.set(key, fromKey(key)))
    const needle = search.trim().toLowerCase()
    return [...byKey.entries()]
      .filter(([, label]) => !needle || label.toLowerCase().includes(needle))
      .sort((a, b) => a[1].localeCompare(b[1], undefined, { sensitivity: 'base' }))
      .map(([key, label]) => ({ value: key, label }))
  }, [names.data, saved, search])

  const submit = async () => {
    if (!exam || chosen === null) return
    try {
      await save.mutateAsync({ id: exam._id, keys: chosen })
      haptic.success()
      allowLeaving()
      setChosen(null)
      setError(null)
      toast(`${exam.name} subjects saved`)
    } catch (failure) {
      haptic.error()
      setError(failure instanceof ApiError ? failure.message : "The subjects didn't save. Try again.")
    }
  }

  return (
    <MobileScreen
      refreshing={names.isRefetching}
      onRefresh={names.refetch}
      nav={<NavBar title="Subjects" back={{ label: exam?.name ?? 'Exam', onPress: router.back }} />}
      actionBar={
        dirty ? (
          <ActionBar
            icon={ListChecks}
            summary={value.length ? `${value.length} ${value.length === 1 ? 'subject' : 'subjects'}` : 'Every subject'}
            detail={exam?.name}
            label={save.isPending ? 'Saving…' : 'Save'}
            onPress={submit}
          />
        ) : undefined
      }
      overlay={
        <ActionSheet
          open={Boolean(leaving)}
          onClose={() => setLeaving(null)}
          title="Discard your changes?"
          actions={[{ label: 'Discard', tone: 'danger', onSelect: () => leaving?.() }]}
          cancelLabel="Keep editing"
        />
      }
    >
      {exams.isPending || names.isPending ? (
        <CardSkeleton rows={6} />
      ) : !exam ? (
        <LoadFailed what="The exam" error={exams.error} onRetry={exams.refetch} />
      ) : names.isError ? (
        <LoadFailed what="Subjects" error={names.error} onRetry={names.refetch} />
      ) : (
        <>
          {error ? (
            <Callout tone="danger" title="Not saved">
              {error}
            </Callout>
          ) : null}
          {options.length > 12 || search ? <SearchBar label="Find a subject" placeholder="Find a subject" value={search} onChange={setSearch} onCancel={() => setSearch('')} /> : null}
          <OptionList
            multiple
            label="Subjects"
            header={`Subjects in ${exam.name}`}
            footer={value.length ? 'Only these subjects get marks, admit cards and datesheets for this exam.' : 'None chosen: the exam covers every subject of each class.'}
            value={value}
            onChange={setChosen}
            options={options}
          />
        </>
      )}
    </MobileScreen>
  )
}
