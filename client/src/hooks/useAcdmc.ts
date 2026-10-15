import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import acdmcService, {
  type ClassWork,
  type ClassWorkKind,
  type ClassWorkStatus,
  type Curriculum,
  type CurriculumStatus,
  type LessonPlan,
  type LessonPlanStatus,
  type ListParams,
  type RosterRow,
} from '@/services/acdmcService'

export const acdmcKeys = {
  all: ['acdmc'] as const,
  options: () => [...acdmcKeys.all, 'options'] as const,
  overview: () => [...acdmcKeys.all, 'overview'] as const,
  lessonPlans: (params: ListParams) => [...acdmcKeys.all, 'lesson-plans', params] as const,
  classWork: (kind: ClassWorkKind, params: ListParams) => [...acdmcKeys.all, kind, 'list', params] as const,
  classWorkItem: (kind: ClassWorkKind, id: string) => [...acdmcKeys.all, kind, 'item', id] as const,
  roster: (kind: ClassWorkKind, id: string) => [...acdmcKeys.all, kind, 'roster', id] as const,
  curriculumList: (params: ListParams) => [...acdmcKeys.all, 'curriculum', 'list', params] as const,
  curriculum: (id: string) => [...acdmcKeys.all, 'curriculum', 'item', id] as const,
  coverage: (id: string) => [...acdmcKeys.all, 'curriculum', 'coverage', id] as const,
}

export const useAcdmcOptions = () =>
  useQuery({ queryKey: acdmcKeys.options(), queryFn: acdmcService.getOptions, staleTime: 5 * 60 * 1000 })

export const useAcdmcOverview = () => useQuery({ queryKey: acdmcKeys.overview(), queryFn: acdmcService.getOverview })

export const useLessonPlans = (params: ListParams) =>
  useQuery({
    queryKey: acdmcKeys.lessonPlans(params),
    queryFn: () => acdmcService.listLessonPlans(params),
    placeholderData: keepPreviousData,
  })

export const useClassWorkList = (kind: ClassWorkKind, params: ListParams) =>
  useQuery({
    queryKey: acdmcKeys.classWork(kind, params),
    queryFn: () => acdmcService.listClassWork(kind, params),
    placeholderData: keepPreviousData,
  })

export const useClassWork = (kind: ClassWorkKind, id?: string) =>
  useQuery({
    queryKey: acdmcKeys.classWorkItem(kind, id || ''),
    queryFn: () => acdmcService.getClassWork(kind, id as string),
    enabled: Boolean(id),
  })

export const useRoster = (kind: ClassWorkKind, id?: string, enabled = true) =>
  useQuery({
    queryKey: acdmcKeys.roster(kind, id || ''),
    queryFn: () => acdmcService.getRoster(kind, id as string),
    enabled: Boolean(id) && enabled,
  })

export const useCurriculumList = (params: ListParams, enabled = true) =>
  useQuery({
    queryKey: acdmcKeys.curriculumList(params),
    queryFn: () => acdmcService.listCurriculum(params),
    placeholderData: keepPreviousData,
    enabled,
  })

export const useCurriculum = (id?: string) =>
  useQuery({ queryKey: acdmcKeys.curriculum(id || ''), queryFn: () => acdmcService.getCurriculum(id as string), enabled: Boolean(id) })

export const useCoverage = (id?: string) =>
  useQuery({ queryKey: acdmcKeys.coverage(id || ''), queryFn: () => acdmcService.getCoverage(id as string), enabled: Boolean(id) })

/** Lesson plans feed syllabus coverage and the overview, so any write refreshes the whole module. */
const useInvalidateAcdmc = () => {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: acdmcKeys.all })
}

export const useSaveLessonPlan = () => {
  const invalidate = useInvalidateAcdmc()
  return useMutation({
    mutationFn: ({ id, payload }: { id?: string; payload: Partial<LessonPlan> }) => acdmcService.saveLessonPlan(id, payload),
    onSuccess: invalidate,
  })
}

export const useLessonPlanStatus = () => {
  const invalidate = useInvalidateAcdmc()
  return useMutation({
    mutationFn: ({ id, status, deliveryNote, deliveredOn }: { id: string; status: LessonPlanStatus; deliveryNote?: string; deliveredOn?: string }) =>
      acdmcService.setLessonPlanStatus(id, { status, deliveryNote, deliveredOn }),
    onSuccess: invalidate,
  })
}

export const useDeleteLessonPlan = () => {
  const invalidate = useInvalidateAcdmc()
  return useMutation({ mutationFn: (id: string) => acdmcService.deleteLessonPlan(id), onSuccess: invalidate })
}

export const useSaveClassWork = (kind: ClassWorkKind) => {
  const invalidate = useInvalidateAcdmc()
  return useMutation({
    mutationFn: ({ id, payload }: { id?: string; payload: Partial<ClassWork> }) => acdmcService.saveClassWork(kind, id, payload),
    onSuccess: invalidate,
  })
}

export const useClassWorkStatus = (kind: ClassWorkKind) => {
  const invalidate = useInvalidateAcdmc()
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: ClassWorkStatus }) => acdmcService.setClassWorkStatus(kind, id, status),
    onSuccess: invalidate,
  })
}

export const useDeleteClassWork = (kind: ClassWorkKind) => {
  const invalidate = useInvalidateAcdmc()
  return useMutation({ mutationFn: (id: string) => acdmcService.deleteClassWork(kind, id), onSuccess: invalidate })
}

export const useSaveSubmissions = (kind: ClassWorkKind) => {
  const invalidate = useInvalidateAcdmc()
  return useMutation({
    mutationFn: ({ id, rows }: { id: string; rows: Array<Partial<RosterRow>> }) => acdmcService.saveSubmissions(kind, id, rows),
    onSuccess: invalidate,
  })
}

export const useSaveCurriculum = () => {
  const invalidate = useInvalidateAcdmc()
  return useMutation({
    mutationFn: ({ id, payload }: { id?: string; payload: Partial<Curriculum> }) => acdmcService.saveCurriculum(id, payload),
    onSuccess: invalidate,
  })
}

export const useCurriculumStatus = () => {
  const invalidate = useInvalidateAcdmc()
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: CurriculumStatus }) => acdmcService.setCurriculumStatus(id, status),
    onSuccess: invalidate,
  })
}

export const useCopyCurriculum = () => {
  const invalidate = useInvalidateAcdmc()
  return useMutation({
    mutationFn: ({ id, classNames, toNextSession }: { id: string; classNames: string[]; toNextSession: boolean }) =>
      acdmcService.copyCurriculum(id, { classNames, toNextSession }),
    onSuccess: invalidate,
  })
}

export const useDeleteCurriculum = () => {
  const invalidate = useInvalidateAcdmc()
  return useMutation({ mutationFn: (id: string) => acdmcService.deleteCurriculum(id), onSuccess: invalidate })
}
