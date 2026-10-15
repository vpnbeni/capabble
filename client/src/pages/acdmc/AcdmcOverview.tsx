import React from 'react'
import { useNavigate } from 'react-router-dom'
import { BookOpen, CalendarCheck, ClipboardList, BookOpenText, RefreshCw } from 'lucide-react'
import { Button, Card, EmptyState, Page, Progress, StatCard } from '@/components/ui'
import { useAcdmcOverview } from '@/hooks/useAcdmc'
import { KIND_META, StatusBadge, classLabel, errorMessage, shortDate } from '@/components/acdmc/AcdmcUi'
import '@/components/acdmc/acdmc.css'

const AcdmcOverview: React.FC = () => {
  const navigate = useNavigate()
  const { data, isLoading, isError, error, refetch, isFetching } = useAcdmcOverview()

  if (isLoading) {
    return (
      <Page>
        <Card>
          <div className="cb-table-state" role="status">
            <span className="cb-spinner" aria-hidden="true" />
            Loading academics
          </div>
        </Card>
      </Page>
    )
  }

  if (isError || !data) {
    return (
      <Page>
        <Card>
          <EmptyState
            title="Couldn't load the academics overview"
            body={errorMessage(error)}
            action={<Button onClick={() => refetch()} icon={RefreshCw}>Try again</Button>}
          />
        </Card>
      </Page>
    )
  }

  const { stats, coverage, dueSoon, todayPlans } = data
  const weekLabel = `${shortDate(data.week.from)} – ${shortDate(data.week.to)}`

  return (
    <Page>
      <div className="cb-stack">
        <section className="cb-stats" aria-label="This week">
          <StatCard
            label="Lesson plans · this week"
            value={stats.plansThisWeek}
            hint={`${stats.deliveredThisWeek} delivered · ${weekLabel}`}
            progress={stats.plansThisWeek ? (stats.deliveredThisWeek / stats.plansThisWeek) * 100 : undefined}
            progressTone="success"
          />
          <StatCard label="Homework due · next 7 days" value={stats.homeworkDueThisWeek} hint="Published homework only" />
          <StatCard
            label="Assignments awaiting marks"
            value={stats.assignmentsAwaitingMarks}
            hint="Due date has passed"
          />
          <StatCard
            label="Syllabi published"
            value={stats.syllabiPublished}
            unit={`of ${stats.syllabiTotal}`}
            progress={stats.syllabiTotal ? (stats.syllabiPublished / stats.syllabiTotal) * 100 : undefined}
          />
        </section>

        <div className="cb-grid-8-4">
          <Card
            title="Syllabus coverage"
            subtitle="Topics delivered in lesson plans, by section"
            action={
              <Button size="sm" variant="tertiary" onClick={() => navigate('/acdmc/curriculum')}>
                View syllabi
              </Button>
            }
          >
            {coverage.length ? (
              <div className="cb-progress-list">
                {coverage.slice(0, 12).map((row) => (
                  <Progress
                    key={`${row.curriculumId}-${row.section}`}
                    label={`${classLabel(row.className, row.section)} · ${row.subjectName}`}
                    value={row.covered}
                    max={row.total || 1}
                    valueLabel={`${row.covered} of ${row.total} topics`}
                    tone={row.percent >= 100 ? 'success' : 'accent'}
                  />
                ))}
                {coverage.length > 12 ? (
                  <p className="cb-muted ac-note">
                    {coverage.length - 12} more on the syllabus pages.
                  </p>
                ) : null}
              </div>
            ) : (
              <EmptyState
                compact
                icon={BookOpen}
                title="No syllabus topics yet"
                body="Add a syllabus with its units and topics. Coverage fills in as lesson plans are marked delivered."
                action={
                  <Button size="sm" onClick={() => navigate('/acdmc/curriculum?new=1')}>
                    Add syllabus
                  </Button>
                }
              />
            )}
          </Card>

          <Card title="Due this week" subtitle="Homework, assignments and quizzes">
            {dueSoon.length ? (
              <ul className="ac-list">
                {dueSoon.map((item) => (
                  <li key={`${item.kind}-${item._id}`}>
                    <button
                      type="button"
                      className="ac-list__row"
                      onClick={() => navigate(`${KIND_META[item.kind].path}/${item._id}`)}
                    >
                      <span className="ac-list__main">
                        <span className="ac-list__title">{item.title}</span>
                        <span className="ac-list__meta">
                          {KIND_META[item.kind].label} · {classLabel(item.className, item.section)} · {item.subjectName}
                        </span>
                      </span>
                      <span className="ac-list__aside">
                        <span>{shortDate(item.date)}</span>
                        {item.kind !== 'quiz' && item.total ? (
                          <span>
                            {item.turnedIn}/{item.total} in
                          </span>
                        ) : null}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                compact
                icon={ClipboardList}
                title="Nothing due this week"
                body="Published homework, assignments and quizzes due in the next 7 days show here."
              />
            )}
          </Card>
        </div>

        <Card
          title="Today's lesson plans"
          subtitle={shortDate(data.today)}
          action={
            <Button size="sm" variant="tertiary" onClick={() => navigate('/acdmc/lesson-plan')}>
              View all
            </Button>
          }
        >
          {todayPlans.length ? (
            <ul className="ac-list">
              {todayPlans.map((plan) => (
                <li key={plan._id}>
                  <button type="button" className="ac-list__row" onClick={() => navigate(`/acdmc/lesson-plan?open=${plan._id}`)}>
                    <span className="ac-list__main">
                      <span className="ac-list__title">{plan.title}</span>
                      <span className="ac-list__meta">
                        {classLabel(plan.className, plan.section)} · {plan.subjectName}
                        {plan.teacherName ? ` · ${plan.teacherName}` : ''}
                      </span>
                    </span>
                    <span className="ac-list__aside">
                      <StatusBadge status={plan.status} />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              compact
              icon={BookOpenText}
              title="No lesson plans for today"
              body="Plans dated today show here so you can mark them delivered."
              action={
                <Button size="sm" icon={CalendarCheck} onClick={() => navigate('/acdmc/lesson-plan?new=1')}>
                  Write a lesson plan
                </Button>
              }
            />
          )}
        </Card>

        {isFetching ? <span className="cb-visually-hidden" role="status">Refreshing</span> : null}
      </div>
    </Page>
  )
}

export default AcdmcOverview
