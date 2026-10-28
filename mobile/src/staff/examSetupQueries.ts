import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { ApiError } from '@/lib/api'
import { examService, type DatesheetPaper, type ExamInput, type NewDatesheet } from '@/services/examService'

import { staffKeys } from './queries'

// Setting up internal exams: the exam itself, its subjects and each class's datesheet.
// Every write refreshes the exam lists the Exams and Marks screens read.

const keys = {
  subjects: (className: string) => [...staffKeys.all, 'exam-setup', 'subjects', className] as const,
  allSubjects: [...staffKeys.all, 'exam-setup', 'subjects', '*'] as const,
  timetable: [...staffKeys.all, 'exam-setup', 'timetable-subjects'] as const,
}

/** A subject that can go on a datesheet: `id` when it is in the school's subject list already. */
export type SubjectChoice = { id?: string; name: string; code?: string }

const byName = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base' })

/**
 * Many schools keep their subjects only in the timetable; the school's subject list (which a
 * datesheet points at) can be empty. Reading the timetable needs timetable access.
 */
export const useTimetableSubjects = (enabled: boolean) =>
  useQuery({ queryKey: keys.timetable, queryFn: examService.timetableSubjects, enabled, staleTime: 10 * 60 * 1000 })

/** One datesheet with subject names; under the datesheets key so every exam write refreshes it. */
export const useDatesheet = (id?: string) =>
  useQuery({ queryKey: [...staffKeys.all, 'exam-datesheets', id ?? ''], queryFn: () => examService.datesheet(id as string), enabled: Boolean(id) })

export const useClassSubjects = (className?: string) =>
  useQuery({
    queryKey: keys.subjects(className ?? ''),
    queryFn: () => examService.classSubjects(className as string),
    enabled: Boolean(className),
    staleTime: 10 * 60 * 1000,
  })

/** Every subject name the school has (subject list and timetable), once each, A to Z. */
export const useSubjectNames = (withTimetable: boolean) => {
  const list = useListedSubjectNames()
  const timetable = useTimetableSubjects(withTimetable)
  const names = new Map<string, string>()
  ;[...(list.data ?? []), ...(timetable.data?.names ?? []), ...(timetable.data?.byClass ?? []).flatMap((row) => row.subjects)].forEach((name) => {
    if (!names.has(name.toLowerCase())) names.set(name.toLowerCase(), name)
  })
  return {
    data: list.data ? [...names.values()].sort(byName) : undefined,
    isPending: list.isPending || (withTimetable && timetable.isPending),
    isError: list.isError,
    error: list.error,
    isRefetching: list.isRefetching,
    refetch: () => Promise.all([list.refetch(), timetable.refetch()]),
  }
}

/** One class's subjects: its subject list entries, then timetable subjects not in that list yet. */
export const useClassSubjectChoices = (className: string | undefined, withTimetable: boolean) => {
  const listed = useClassSubjects(className)
  const timetable = useTimetableSubjects(withTimetable && Boolean(className))
  const choices: SubjectChoice[] = (listed.data ?? []).map((row) => ({ id: row._id, name: row.name, code: row.code }))
  const known = new Set(choices.map((row) => row.name.toLowerCase()))
  ;(timetable.data?.byClass ?? [])
    .filter((row) => row.className === className)
    .flatMap((row) => row.subjects)
    .forEach((name) => {
      if (known.has(name.toLowerCase())) return
      known.add(name.toLowerCase())
      choices.push({ name })
    })
  return { data: choices.sort((a, b) => byName(a.name, b.name)), isPending: listed.isPending || (withTimetable && Boolean(className) && timetable.isPending) }
}

/** A subject code the server takes (3 to 8 capitals or digits), from the name. */
const codeFor = (name: string, attempt: number) => {
  const base = name.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, attempt ? 7 : 8).padEnd(3, 'X')
  return attempt ? `${base}${attempt}` : base
}

/** Adds a timetable subject to a class's subject list, trying another code if one is taken. */
export const useAddClassSubject = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ name, className }: { name: string; className: string }) => {
      for (let attempt = 0; ; attempt += 1) {
        try {
          return await examService.createSubject({ name, code: codeFor(name, attempt), class: className })
        } catch (error) {
          if (!(error instanceof ApiError && error.status === 409) || attempt >= 8) throw error
        }
      }
    },
    onSuccess: (_, { className }) => queryClient.invalidateQueries({ queryKey: keys.subjects(className) }),
  })
}

const useListedSubjectNames = () =>
  useQuery({
    queryKey: keys.allSubjects,
    queryFn: async () => {
      const names = new Map<string, string>()
      for (let page = 1; page <= 10; page += 1) {
        const rows = await examService.allSubjects(page)
        rows.forEach((row) => {
          const name = row.name?.trim()
          if (name && !names.has(name.toLowerCase())) names.set(name.toLowerCase(), name)
        })
        if (rows.length < 100) break
      }
      return [...names.values()].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
    },
    staleTime: 10 * 60 * 1000,
  })

const useWrite = <T, R>(fn: (input: T) => Promise<R>) => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: [...staffKeys.all, 'marks'] }),
        queryClient.invalidateQueries({ queryKey: [...staffKeys.all, 'exam-datesheets'] }),
      ]),
  })
}

export const useSaveExam = () =>
  useWrite(({ id, input }: { id?: string; input: Partial<ExamInput> }) =>
    id ? examService.updateExam(id, input) : examService.createExam(input as ExamInput),
  )
export const useRemoveExam = () => useWrite((id: string) => examService.removeExam(id))
export const useSetExamSubjects = () => useWrite(({ id, keys: subjectKeys }: { id: string; keys: string[] }) => examService.setExamSubjects(id, subjectKeys))

/** A new datesheet is made empty, then its papers are saved (as the website does). */
export const useCreateDatesheet = () =>
  useWrite(async ({ sheet, papers }: { sheet: NewDatesheet; papers: DatesheetPaper[] }) => {
    const created = await examService.createDatesheet(sheet)
    return examService.updateDatesheet(created._id, { subjects: papers })
  })
export const useUpdateDatesheet = () =>
  useWrite(({ id, input }: { id: string; input: Parameters<typeof examService.updateDatesheet>[1] }) => examService.updateDatesheet(id, input))
export const usePublishDatesheet = () => useWrite((id: string) => examService.publishDatesheet(id))
export const useRemoveDatesheet = () => useWrite((id: string) => examService.removeDatesheet(id))
