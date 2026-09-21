import React, { useMemo, useState } from 'react'
import { AlertCircle, CheckCircle2, ChevronDown, ChevronRight, Clock3 } from 'lucide-react'
import type { ResultClassSectionStatus, ResultSubjectStatus } from '@/services/exmclResultService'

type ResultEntryStatusPanelProps = {
  loading: boolean
  rows: ResultClassSectionStatus[]
  selectedClass: string
  selectedSection: string
  onSelectClassSection: (className: string, section: string) => void
}

const statusStyles: Record<
  ResultSubjectStatus,
  { badge: string; dot: string; label: string }
> = {
  complete: {
    badge: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
    dot: 'bg-emerald-500',
    label: 'Complete',
  },
  partial: {
    badge: 'bg-amber-50 text-amber-700 ring-amber-100',
    dot: 'bg-amber-500',
    label: 'In progress',
  },
  pending: {
    badge: 'bg-slate-100 text-slate-600 ring-slate-200',
    dot: 'bg-slate-400',
    label: 'Pending',
  },
}

const pct = (filled: number, total: number) => (total > 0 ? Math.round((filled / total) * 100) : 0)

const ResultEntryStatusPanel: React.FC<ResultEntryStatusPanelProps> = ({
  loading,
  rows,
  selectedClass,
  selectedSection,
  onSelectClassSection,
}) => {
  const [expandedKey, setExpandedKey] = useState<string | null>(null)

  const summary = useMemo(() => {
    const completeSections = rows.filter((row) => row.overallStatus === 'complete').length
    const partialSections = rows.filter((row) => row.overallStatus === 'partial').length
    const pendingSections = rows.filter((row) => row.overallStatus === 'pending').length
    const pendingSubjects = rows.reduce(
      (sum, row) => sum + row.subjects.filter((subject) => subject.status !== 'complete').length,
      0
    )
    const pendingCells = rows.reduce((sum, row) => sum + row.pendingCells, 0)
    const totalCells = rows.reduce((sum, row) => sum + row.totalCells, 0)
    return {
      completeSections,
      partialSections,
      pendingSections,
      pendingSubjects,
      pendingCells,
      totalCells,
      progress: pct(totalCells - pendingCells, totalCells),
    }
  }, [rows])

  if (loading) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div className="animate-pulse space-y-3">
          <div className="h-4 w-48 rounded bg-gray-200 dark:bg-gray-700" />
          <div className="h-16 rounded-xl bg-gray-100 dark:bg-gray-700/60" />
          <div className="h-24 rounded-xl bg-gray-100 dark:bg-gray-700/60" />
        </div>
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-200 bg-white p-6 text-sm text-gray-500 shadow-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">
        No active students found. Add students in STDNT to track result entry status by class and section.
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <div className="border-b border-gray-100 px-4 py-4 dark:border-gray-700 sm:px-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Result Entry Status</h3>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Track pending marks by class, section, and subject for the selected exam.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700 ring-1 ring-emerald-100">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {summary.completeSections} complete
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-700 ring-1 ring-amber-100">
              <Clock3 className="h-3.5 w-3.5" />
              {summary.partialSections} in progress
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600 ring-1 ring-slate-200">
              <AlertCircle className="h-3.5 w-3.5" />
              {summary.pendingSubjects} subjects pending
            </span>
          </div>
        </div>

        <div className="mt-4">
          <div className="mb-1.5 flex items-center justify-between text-[11px] font-medium text-gray-500 dark:text-gray-400">
            <span>Overall completion</span>
            <span>{summary.progress}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700">
            <div
              className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all duration-500"
              style={{ width: `${summary.progress}%` }}
            />
          </div>
          <p className="mt-1.5 text-[11px] text-gray-400 dark:text-gray-500">
            {summary.pendingCells} of {summary.totalCells} student-subject entries still pending
          </p>
        </div>
      </div>

      <div className="divide-y divide-gray-100 dark:divide-gray-700">
        {rows.map((row) => {
          const key = `${row.class}-${row.section}`
          const isExpanded = expandedKey === key
          const isSelected =
            selectedClass.trim().toLowerCase() === row.class.trim().toLowerCase() &&
            selectedSection.trim().toLowerCase() === row.section.trim().toLowerCase()
          const style = statusStyles[row.overallStatus]
          const rowProgress = pct(row.filledCells, row.totalCells)
          const pendingSubjectNames = row.subjects
            .filter((subject) => subject.status !== 'complete')
            .map((subject) => subject.subjectName)

          return (
            <div key={key} className={isSelected ? 'bg-indigo-50/40 dark:bg-indigo-950/20' : ''}>
              <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                <button
                  type="button"
                  onClick={() => setExpandedKey(isExpanded ? null : key)}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                >
                  <span className={`inline-flex h-2.5 w-2.5 shrink-0 rounded-full ${style.dot}`} />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">
                      Class {row.class} · Section {row.section}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {row.studentCount} students · {row.subjectCount} subjects · {rowProgress}% filled
                    </p>
                  </div>
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4 shrink-0 text-gray-400" />
                  ) : (
                    <ChevronRight className="h-4 w-4 shrink-0 text-gray-400" />
                  )}
                </button>

                <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                  <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ${style.badge}`}>
                    {style.label}
                  </span>
                  {pendingSubjectNames.length > 0 ? (
                    <span className="max-w-[280px] truncate text-[11px] text-amber-700 dark:text-amber-300">
                      Pending: {pendingSubjectNames.join(', ')}
                    </span>
                  ) : (
                    <span className="text-[11px] text-emerald-600 dark:text-emerald-400">All subjects complete</span>
                  )}
                  <button
                    type="button"
                    onClick={() => onSelectClassSection(row.class, row.section)}
                    className="rounded-lg border border-indigo-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-indigo-600 transition hover:bg-indigo-50 dark:border-indigo-800 dark:bg-gray-900 dark:text-indigo-300 dark:hover:bg-indigo-950/40"
                  >
                    Open sheet
                  </button>
                </div>
              </div>

              {isExpanded ? (
                <div className="border-t border-gray-100 px-4 pb-4 pt-3 dark:border-gray-700 sm:px-5">
                  {row.subjects.length === 0 ? (
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      No subjects configured for this class. Add subjects in Subjects or assign them to students.
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
                      {row.subjects.map((subject) => {
                        const subjectStyle = statusStyles[subject.status]
                        const subjectProgress = pct(subject.filledCount, subject.studentCount)
                        return (
                          <div
                            key={subject.subjectId}
                            className="rounded-xl border border-gray-200 bg-gray-50/70 p-3 dark:border-gray-700 dark:bg-gray-900/40"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium text-gray-900 dark:text-white">
                                  {subject.subjectName}
                                </p>
                                <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">
                                  {subject.filledCount}/{subject.studentCount} students filled
                                </p>
                              </div>
                              <span
                                className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${subjectStyle.badge}`}
                              >
                                {subject.pendingCount > 0 ? `${subject.pendingCount} pending` : 'Done'}
                              </span>
                            </div>
                            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white dark:bg-gray-800">
                              <div
                                className={`h-full rounded-full ${
                                  subject.status === 'complete'
                                    ? 'bg-emerald-500'
                                    : subject.status === 'partial'
                                      ? 'bg-amber-500'
                                      : 'bg-slate-300'
                                }`}
                                style={{ width: `${subjectProgress}%` }}
                              />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default ResultEntryStatusPanel
