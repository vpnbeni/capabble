import React, { useEffect, useMemo } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, CalendarX2, Contact, GraduationCap, LayoutGrid, Rows, UserX, Users } from 'lucide-react'
import type { AppDispatch, RootState } from '../redux/store'
import { fetchStudentStats } from '../redux/slices/studentSlice'
import { sortClassNames, sortSectionNames } from '../constants/studentClasses'
import { Badge, Button, Card, DataTable, EmptyState, Icon, Page, Progress, StatCard, type DataTableColumn } from '@/components/ui'
import { classLabel, formatCount, sectionLabel } from '@/components/students/studentFormat'
import '@/components/students/students.css'

type SectionCount = { section: string; count: number; active: number }
type ClassGroup = { className: string; sections: SectionCount[]; total: number; active: number }

const GENDER_SERIES = [
  { key: 'Boy', label: 'Boys', color: 'var(--chart-1)' },
  { key: 'Girl', label: 'Girls', color: 'var(--chart-2)' },
  { key: 'Other', label: 'Other', color: 'var(--chart-4)' },
  { key: 'Unspecified', label: 'Not recorded', color: 'var(--neutral-solid)' },
] as const

const percent = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0)

const StudentInfo: React.FC = () => {
  const dispatch = useDispatch<AppDispatch>()
  const navigate = useNavigate()
  const { stats, loading } = useSelector((state: RootState) => state.students)

  useEffect(() => {
    dispatch(fetchStudentStats())
  }, [dispatch])

  const classGroups = useMemo<ClassGroup[]>(() => {
    const grouped = new Map<string, SectionCount[]>()
    ;(stats?.byClassSection || []).forEach((entry) => {
      const list = grouped.get(entry._id.class) || []
      list.push({ section: entry._id.section, count: entry.count, active: entry.active })
      grouped.set(entry._id.class, list)
    })
    return Array.from(grouped.entries())
      .map(([className, sections]) => ({
        className,
        sections: sections.sort((a, b) => sortSectionNames(a.section, b.section, className)),
        total: sections.reduce((sum, s) => sum + s.count, 0),
        active: sections.reduce((sum, s) => sum + s.active, 0),
      }))
      .sort((a, b) => sortClassNames(a.className, b.className))
  }, [stats])

  const largestSection = useMemo(
    () => Math.max(1, ...classGroups.flatMap((group) => group.sections.map((s) => s.count))),
    [classGroups]
  )

  const genderCounts = useMemo(() => {
    const index = new Map((stats?.byGender || []).map((entry) => [entry._id, entry.count]))
    return GENDER_SERIES.map((series) => ({ ...series, count: index.get(series.key) || 0 }))
  }, [stats])
  const genderTotal = genderCounts.reduce((sum, g) => sum + g.count, 0)

  const total = stats?.total ?? 0
  const active = stats?.activeTotal ?? 0
  const inactive = Math.max(0, total - active)
  const classCount = stats?.byClass?.length ?? classGroups.length
  const sectionCount = stats?.byClassSection?.length ?? 0
  const unrecordedGender = genderCounts.find((g) => g.key === 'Unspecified')?.count ?? 0
  const withDob = (stats?.ageMatrix || []).reduce((sum, entry) => sum + entry.count, 0)
  const missingDob = Math.max(0, total - withDob)

  const ageMatrix = useMemo(() => {
    const entries = stats?.ageMatrix || []
    const ages = Array.from(new Set(entries.map((e) => e._id.age))).sort((a, b) => a - b)
    const classes = Array.from(new Set(entries.map((e) => e._id.class))).sort(sortClassNames)
    const lookup = new Map(entries.map((e) => [`${e._id.class}|${e._id.age}`, e.count]))
    const max = Math.max(1, ...entries.map((e) => e.count))
    return { ages, classes, lookup, max }
  }, [stats])

  const ageColumns = useMemo<DataTableColumn<{ id: string; className: string }>[]>(
    () => [
      {
        key: 'class',
        header: 'Class',
        mobile: 'title',
        render: (row) => <span className="cb-strong">{classLabel(row.className)}</span>,
      },
      ...ageMatrix.ages.map<DataTableColumn<{ id: string; className: string }>>((age) => ({
        key: `age-${age}`,
        header: `${age} yrs`,
        align: 'center',
        numeric: true,
        render: (row) => {
          const count = ageMatrix.lookup.get(`${row.className}|${age}`) || 0
          if (!count) return <span className="cb-subtle">—</span>
          const strength = 10 + Math.round((count / ageMatrix.max) * 35)
          return (
            <span
              className="stdnt-heat"
              style={{ background: `color-mix(in srgb, var(--accent) ${strength}%, transparent)` }}
            >
              {count}
            </span>
          )
        },
      })),
    ],
    [ageMatrix]
  )

  const goToStudents = () => navigate('/stdnt/students')

  if (loading && !stats) {
    return (
      <Page>
        <div className="cb-table-state" role="status">
          <span className="cb-spinner" aria-hidden="true" />
          Loading the students overview
        </div>
      </Page>
    )
  }

  return (
    <Page>
      <section className="cb-stats" aria-label="Student totals">
        <StatCard label="Total students" value={formatCount(total)} icon={Users} hint="All records this session" />
        <StatCard
          label="Active students"
          value={formatCount(active)}
          icon={GraduationCap}
          hint={inactive > 0 ? `${formatCount(inactive)} inactive` : 'Everyone is active'}
          progress={percent(active, total)}
        />
        <StatCard label="Classes" value={formatCount(classCount)} icon={LayoutGrid} hint="With at least one student" />
        <StatCard label="Sections" value={formatCount(sectionCount)} icon={Rows} hint="Across all classes" />
      </section>

      <div className="cb-grid-8-4">
        <Card
          title="Students by class and section"
          subtitle="Bars compare each section with the largest one in school."
          action={
            <Button variant="tertiary" size="sm" iconRight={ArrowRight} onClick={goToStudents}>
              View students
            </Button>
          }
        >
          {classGroups.length === 0 ? (
            <EmptyState
              compact
              icon={Users}
              title="No students added yet"
              body="Class and section counts appear here once student records are added or imported."
              action={
                <Button variant="primary" size="sm" onClick={goToStudents}>
                  Add students
                </Button>
              }
            />
          ) : (
            <ul className="stdnt-classes">
              {classGroups.map((group, groupIndex) => (
                <li key={group.className} className="stdnt-class">
                  <div className="stdnt-class__head">
                    <h4 className="stdnt-class__name">{classLabel(group.className)}</h4>
                    <span className="stdnt-class__meta is-num">
                      {formatCount(group.total)} students · {group.sections.length}{' '}
                      {group.sections.length === 1 ? 'section' : 'sections'}
                    </span>
                  </div>
                  <ul className="stdnt-sections">
                    {group.sections.map((s, sectionIndex) => {
                      const inactiveHere = s.count - s.active
                      return (
                        <li key={s.section} className={`stdnt-section stdnt-section--c${((groupIndex + sectionIndex) % 6) + 1}`}>
                          <span className="stdnt-section__name">{sectionLabel(s.section) || '—'}</span>
                          <span className="stdnt-section__count is-num">{s.count}</span>
                          <Progress value={s.count} max={largestSection} showValue={false} size="sm" />
                          <span className="stdnt-section__meta">
                            {inactiveHere > 0 ? `${inactiveHere} inactive` : 'All active'}
                          </span>
                        </li>
                      )
                    })}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="cb-stack">
          <Card title="Gender split" subtitle={`${formatCount(genderTotal)} students`}>
            {genderTotal === 0 ? (
              <EmptyState compact icon={Contact} title="No students yet" />
            ) : (
              <div className="stdnt-gender">
                <div className="stdnt-gender__bar" role="img" aria-label={genderCounts.map((g) => `${g.label} ${g.count}`).join(', ')}>
                  {genderCounts
                    .filter((g) => g.count > 0)
                    .map((g) => (
                      <span key={g.key} style={{ width: `${(g.count / genderTotal) * 100}%`, background: g.color }} />
                    ))}
                </div>
                <ul className="stdnt-legend">
                  {genderCounts.map((g) => (
                    <li key={g.key}>
                      <span className="stdnt-legend__dot" style={{ background: g.color }} aria-hidden="true" />
                      <span className="stdnt-legend__label">{g.label}</span>
                      <span className="stdnt-legend__value is-num">{formatCount(g.count)}</span>
                      <span className="stdnt-legend__pct is-num">{percent(g.count, genderTotal)}%</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>

          <Card
            title="Records to complete"
            subtitle={
              unrecordedGender + missingDob + inactive === 0 ? 'Every record has the basics.' : 'Fix these from the student list.'
            }
          >
            <ul className="stdnt-todo">
              {[
                { icon: Contact, label: 'Gender not recorded', count: unrecordedGender, tone: 'warning' as const },
                { icon: CalendarX2, label: 'Date of birth missing', count: missingDob, tone: 'warning' as const },
                { icon: UserX, label: 'Marked inactive', count: inactive, tone: 'neutral' as const },
              ].map((item) => (
                <li key={item.label}>
                  <Icon icon={item.icon} size={16} className="stdnt-todo__icon" />
                  <span className="stdnt-todo__label">{item.label}</span>
                  {item.count > 0 ? (
                    <Badge tone={item.tone}>
                      {formatCount(item.count)} {item.count === 1 ? 'student' : 'students'}
                    </Badge>
                  ) : (
                    <Badge tone="success">None</Badge>
                  )}
                </li>
              ))}
            </ul>
            <div className="stdnt-todo__action">
              <Button size="sm" onClick={goToStudents}>
                Review students
              </Button>
            </div>
          </Card>
        </div>
      </div>

      <Card title="Age by class" subtitle="Students counted by age on their date of birth. Darker cells hold more students. Scroll sideways for more ages." flush className="stdnt-age">
        <DataTable
          caption="Students by age in each class"
          columns={ageColumns}
          rows={ageMatrix.classes.map((className) => ({ id: className, className }))}
          getRowKey={(row) => row.id}
          empty={
            <EmptyState
              compact
              icon={CalendarX2}
              title="No dates of birth recorded"
              body="The age spread appears once students have a date of birth."
            />
          }
        />
      </Card>
    </Page>
  )
}

export default StudentInfo
