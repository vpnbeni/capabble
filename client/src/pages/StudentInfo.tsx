import React, { useEffect, useMemo } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { BarChart3, GraduationCap, LayoutGrid, Users } from 'lucide-react'
import type { AppDispatch, RootState } from '../redux/store'
import { fetchStudentStats } from '../redux/slices/studentSlice'

const sectionToneClasses = [
  'bg-blue-50 text-blue-700 ring-1 ring-blue-100',
  'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100',
  'bg-amber-50 text-amber-700 ring-1 ring-amber-100',
  'bg-violet-50 text-violet-700 ring-1 ring-violet-100',
]

const kpiCards = [
  {
    key: 'total',
    label: 'Total',
    hint: 'All records',
    icon: Users,
    valueClass: 'text-blue-600',
    iconWrap: 'bg-blue-50 text-blue-600 ring-1 ring-blue-100',
    bar: 'from-blue-500 to-indigo-400',
  },
  {
    key: 'active',
    label: 'Active',
    hint: 'In session',
    icon: GraduationCap,
    valueClass: 'text-emerald-600',
    iconWrap: 'bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100',
    bar: 'from-emerald-500 to-teal-400',
  },
  {
    key: 'classes',
    label: 'Classes',
    hint: 'Tracked',
    icon: LayoutGrid,
    valueClass: 'text-violet-600',
    iconWrap: 'bg-violet-50 text-violet-600 ring-1 ring-violet-100',
    bar: 'from-violet-500 to-fuchsia-400',
  },
  {
    key: 'sections',
    label: 'Sections',
    hint: 'With students',
    icon: BarChart3,
    valueClass: 'text-amber-600',
    iconWrap: 'bg-amber-50 text-amber-600 ring-1 ring-amber-100',
    bar: 'from-amber-500 to-orange-400',
  },
] as const

const StudentInfo: React.FC = () => {
  const dispatch = useDispatch<AppDispatch>()
  const { stats, loading } = useSelector((state: RootState) => state.students)

  useEffect(() => {
    dispatch(fetchStudentStats())
  }, [dispatch])

  const classSectionGroups = useMemo(() => {
    const grouped = new Map<string, Array<{ section: string; count: number; active: number }>>()

    ;(stats?.byClassSection || []).forEach((entry) => {
      const current = grouped.get(entry._id.class) || []
      current.push({
        section: entry._id.section,
        count: entry.count,
        active: entry.active,
      })
      grouped.set(entry._id.class, current)
    })

    return Array.from(grouped.entries()).map(([className, sections]) => ({
      className,
      sections: sections.sort((a, b) => a.section.localeCompare(b.section)),
      total: sections.reduce((sum, section) => sum + section.count, 0),
    }))
  }, [stats])

  const genderCounts = useMemo(() => {
    const index = new Map((stats?.byGender || []).map((entry) => [entry._id, entry.count]))
    return {
      boys: index.get('Boy') || 0,
      girls: index.get('Girl') || 0,
      other: index.get('Other') || 0,
      unspecified: index.get('Unspecified') || 0,
    }
  }, [stats])

  const genderTotal =
    genderCounts.boys + genderCounts.girls + genderCounts.other + genderCounts.unspecified || 1

  const kpiValues = {
    total: stats?.total ?? 0,
    active: stats?.activeTotal ?? 0,
    classes: stats?.byClass?.length ?? 0,
    sections: stats?.byClassSection?.length ?? 0,
  }

  const ageMatrix = useMemo(() => {
    const classes = Array.from(new Set((stats?.ageMatrix || []).map((entry) => entry._id.class)))
    const ages = Array.from(new Set((stats?.ageMatrix || []).map((entry) => entry._id.age))).sort((a, b) => a - b)
    const lookup = new Map((stats?.ageMatrix || []).map((entry) => [`${entry._id.class}-${entry._id.age}`, entry.count]))

    return {
      classes,
      ages,
      lookup,
    }
  }, [stats])

  if (loading && !stats) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white px-6 py-12 text-center text-sm text-slate-500">
        Loading student dashboard...
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {kpiCards.map((card) => {
          const Icon = card.icon
          return (
            <article
              key={card.key}
              className="group relative overflow-hidden rounded-xl border border-slate-200 bg-white px-3.5 py-3 transition hover:border-slate-300"
            >
              <div className={`absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r ${card.bar}`} />
              <div className="flex items-center gap-3">
                <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${card.iconWrap}`}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{card.label}</p>
                  <div className="mt-0.5 flex items-baseline justify-between gap-2">
                    <p className={`text-2xl font-bold leading-none tracking-tight ${card.valueClass}`}>
                      {kpiValues[card.key]}
                    </p>
                    <p className="truncate text-[11px] text-slate-400">{card.hint}</p>
                  </div>
                </div>
              </div>
            </article>
          )
        })}
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)]">
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="flex items-end justify-between gap-3 border-b border-slate-100 px-5 py-3.5">
            <div>
              <h2 className="text-base font-semibold tracking-tight text-slate-900">Students by Class and Section</h2>
              <p className="mt-0.5 text-xs text-slate-500">Dense vs thin cohorts at a glance.</p>
            </div>
          </div>

          <div className="space-y-4 p-5">
            {classSectionGroups.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                No student distribution is available yet.
              </div>
            ) : (
              classSectionGroups.map((group, groupIndex) => (
                <div key={group.className} className="rounded-xl border border-slate-200 bg-slate-50/60 px-3.5 py-3">
                  <div className="mb-2.5 flex items-center justify-between gap-2">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <p className="text-sm font-semibold text-slate-900">Class {group.className}</p>
                      <p className="text-xs text-slate-500">
                        {group.total} students · {group.sections.length} sections
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                    {group.sections.map((section, sectionIndex) => (
                      <div
                        key={`${group.className}-${section.section}`}
                        className={`rounded-lg px-3 py-2.5 ${sectionToneClasses[(groupIndex + sectionIndex) % sectionToneClasses.length]}`}
                      >
                        <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-current/70">
                          {section.section}
                        </div>
                        <div className="mt-1.5 flex items-baseline justify-between gap-1">
                          <span className="text-lg font-bold leading-none text-slate-900">{section.count}</span>
                          <span className="text-[10px] text-slate-500">{section.active} active</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="space-y-5">
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="border-b border-slate-100 px-5 py-3.5">
              <h2 className="text-base font-semibold tracking-tight text-slate-900">Gender Split</h2>
            </div>

            <div className="space-y-3.5 p-5">
              <div className="flex h-2.5 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="bg-blue-500"
                  style={{ width: `${(genderCounts.boys / genderTotal) * 100}%` }}
                  title={`Boys ${genderCounts.boys}`}
                />
                <div
                  className="bg-rose-400"
                  style={{ width: `${(genderCounts.girls / genderTotal) * 100}%` }}
                  title={`Girls ${genderCounts.girls}`}
                />
                {genderCounts.other > 0 ? (
                  <div
                    className="bg-violet-400"
                    style={{ width: `${(genderCounts.other / genderTotal) * 100}%` }}
                    title={`Other ${genderCounts.other}`}
                  />
                ) : null}
                {genderCounts.unspecified > 0 ? (
                  <div
                    className="bg-slate-400"
                    style={{ width: `${(genderCounts.unspecified / genderTotal) * 100}%` }}
                    title={`Unspecified ${genderCounts.unspecified}`}
                  />
                ) : null}
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div className="rounded-lg border border-blue-100 bg-blue-50/80 px-3 py-2.5">
                  <p className="text-[11px] font-medium text-blue-700">Boys</p>
                  <p className="mt-0.5 text-xl font-bold leading-tight text-slate-900">{genderCounts.boys}</p>
                </div>
                <div className="rounded-lg border border-rose-100 bg-rose-50/80 px-3 py-2.5">
                  <p className="text-[11px] font-medium text-rose-700">Girls</p>
                  <p className="mt-0.5 text-xl font-bold leading-tight text-slate-900">{genderCounts.girls}</p>
                </div>
                {(genderCounts.other > 0 || genderCounts.unspecified > 0) ? (
                  <>
                    <div className="rounded-lg border border-violet-100 bg-violet-50/80 px-3 py-2.5">
                      <p className="text-[11px] font-medium text-violet-700">Other</p>
                      <p className="mt-0.5 text-lg font-bold leading-tight text-slate-900">{genderCounts.other}</p>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
                      <p className="text-[11px] font-medium text-slate-600">Unspecified</p>
                      <p className="mt-0.5 text-lg font-bold leading-tight text-slate-900">{genderCounts.unspecified}</p>
                    </div>
                  </>
                ) : null}
              </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="border-b border-slate-100 px-5 py-3.5">
              <h2 className="text-base font-semibold tracking-tight text-slate-900">Class Snapshot</h2>
            </div>

            <div className="max-h-[320px] space-y-2 overflow-auto p-4">
              {(stats?.byClass || []).length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                  Class-wise counts appear once records are added.
                </div>
              ) : (
                (stats?.byClass || []).map((entry, index) => (
                  <div
                    key={entry._id}
                    className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2.5"
                  >
                    <div>
                      <p className="text-sm font-semibold text-slate-900">Class {entry._id}</p>
                      <p className="mt-0.5 text-[11px] text-slate-500">{entry.active} active</p>
                    </div>
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${sectionToneClasses[index % sectionToneClasses.length]}`}>
                      {entry.count}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-5 py-3.5">
          <h2 className="text-base font-semibold tracking-tight text-slate-900">Student Age Matrix</h2>
          <p className="mt-0.5 text-xs text-slate-500">Age spread across classes in this session.</p>
        </div>

        {(ageMatrix.classes.length === 0 || ageMatrix.ages.length === 0) ? (
          <div className="px-5 py-8 text-center text-sm text-slate-500">
            Age data will populate here once students with date of birth are available.
          </div>
        ) : (
          <div className="overflow-x-auto p-5">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr className="text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                  <th className="rounded-l-xl px-3 py-2.5">Age</th>
                  {ageMatrix.classes.map((className) => (
                    <th key={className} className="px-3 py-2.5">
                      {className}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white text-sm text-slate-700">
                {ageMatrix.ages.map((age) => (
                  <tr key={age} className="hover:bg-slate-50/80">
                    <td className="px-3 py-2.5 font-semibold text-slate-900">{age}</td>
                    {ageMatrix.classes.map((className) => {
                      const count = ageMatrix.lookup.get(`${className}-${age}`) || 0
                      return (
                        <td key={`${className}-${age}`} className="px-3 py-2.5">
                          <span
                            className={`inline-flex min-w-[2.25rem] justify-center rounded-full px-2 py-0.5 text-xs font-semibold ${
                              count > 0 ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-400'
                            }`}
                          >
                            {count}
                          </span>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

export default StudentInfo
