import React from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  AlertTriangle,
  ArrowRight,
  CalendarCheck,
  CalendarRange,
  CheckCircle2,
  IndianRupee,
  Pin,
  Settings2,
  UserRound,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import { Badge, Button, Card, EmptyState, Icon, Progress, formatINR } from '@/components/ui'
import { formatCount } from '@/components/students/studentFormat'
import attndService from '@/services/attndService'
import cpitlService from '@/services/cpitlService'
import timetableService from '@/services/timetableService'
import type { LocalEntry } from '@/components/commandPalette/useLocalIndex'
import type { QuickAction } from './quickActions'
import type { WidgetId } from './homeLayout'

const pad = (n: number) => String(n).padStart(2, '0')
const todayKey = () => {
  const now = new Date()
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}
const percent = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0)

export type WidgetDef = {
  id: WidgetId
  title: string
  description: string
  /** Page the widget reads from; the widget is offered only when this page is open to the school. */
  requiresPath?: string
  wide?: boolean
}

export const WIDGETS: Record<WidgetId, WidgetDef> = {
  'quick-actions': {
    id: 'quick-actions',
    title: 'Quick actions',
    description: 'One-click shortcuts for everyday tasks.',
    wide: true,
  },
  'attendance-today': {
    id: 'attendance-today',
    title: 'Attendance today',
    description: 'Students and staff present today.',
    requiresPath: '/attnd/attndboard',
  },
  'attendance-watch': {
    id: 'attendance-watch',
    title: 'Sections to watch',
    description: 'Class sections with the lowest attendance this month.',
    requiresPath: '/attnd/attndboard',
  },
  fees: {
    id: 'fees',
    title: 'Fee collection',
    description: 'Collected, pending and overdue fees this session.',
    requiresPath: '/cpitl/dashboard',
  },
  'fee-defaulters': {
    id: 'fee-defaulters',
    title: 'Overdue fees',
    description: 'Students with the largest overdue balances.',
    requiresPath: '/cpitl/dashboard',
  },
  timetable: {
    id: 'timetable',
    title: 'Timetable',
    description: 'The published timetable and any drafts in progress.',
    requiresPath: '/time-table/generate',
  },
  pinned: {
    id: 'pinned',
    title: 'Pinned pages',
    description: 'Pages you open often, one click away.',
    wide: true,
  },
}

/* ---------- shared bits ---------- */

const Loading: React.FC<{ label: string }> = ({ label }) => (
  <div className="cb-table-state" role="status">
    <span className="cb-spinner" aria-hidden="true" />
    {label}
  </div>
)

const LoadError: React.FC<{ what: string; onRetry: () => void }> = ({ what, onRetry }) => (
  <EmptyState
    compact
    icon={AlertTriangle}
    title={`Couldn't load ${what}`}
    body="Check your connection and try again."
    action={
      <Button size="sm" onClick={onRetry}>
        Try again
      </Button>
    }
  />
)

const OpenLink: React.FC<{ label: string; to: string }> = ({ label, to }) => {
  const navigate = useNavigate()
  return (
    <Button variant="tertiary" size="sm" iconRight={ArrowRight} onClick={() => navigate(to)}>
      {label}
    </Button>
  )
}

/* ---------- Quick actions ---------- */

export const QuickActionsWidget: React.FC<{ actions: QuickAction[]; onEdit: () => void }> = ({ actions, onEdit }) => {
  const navigate = useNavigate()
  return (
    <Card
      title="Quick actions"
      action={
        <Button variant="tertiary" size="sm" icon={Settings2} onClick={onEdit}>
          Choose actions
        </Button>
      }
      className="home-widget"
    >
      {actions.length === 0 ? (
        <EmptyState
          compact
          title="No quick actions chosen"
          action={
            <Button size="sm" onClick={onEdit}>
              Choose actions
            </Button>
          }
        />
      ) : (
        <ul className="home-actions">
          {actions.map((action) => (
            <li key={action.id}>
              <button type="button" className="home-action" onClick={() => navigate(action.path)}>
                {action.icon ? (
                  <span className="home-action__icon" aria-hidden="true">
                    <Icon icon={action.icon} size={18} />
                  </span>
                ) : null}
                <span className="home-action__label">{action.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

/* ---------- Attendance ---------- */

const useAttendance = () => {
  const date = todayKey()
  return useQuery({
    queryKey: ['home', 'attnd-dashboard', date],
    queryFn: () => attndService.getDashboard(date.slice(0, 7), date),
    staleTime: 60_000,
  })
}

const PresenceRow: React.FC<{
  icon: LucideIcon
  label: string
  present: number
  strength: number
  absent: number
  halfDay: number
}> = ({ icon, label, present, strength, absent, halfDay }) => {
  const rate = percent(present, strength)
  return (
    <div className="home-presence">
      <span className="home-presence__icon" aria-hidden="true">
        <Icon icon={icon} size={16} />
      </span>
      <div className="home-presence__main">
        <div className="home-presence__head">
          <span className="home-presence__label">{label}</span>
          <span className="home-presence__value">
            {formatCount(present)}
            <span className="home-presence__of"> / {formatCount(strength)}</span>
          </span>
        </div>
        <Progress
          value={rate}
          showValue={false}
          size="sm"
          tone={rate >= 95 ? 'success' : rate >= 90 ? 'warning' : 'danger'}
        />
        <span className="home-presence__meta">
          {absent === 0 && halfDay === 0
            ? 'Nobody absent'
            : `${formatCount(absent)} absent${halfDay ? ` · ${formatCount(halfDay)} half day` : ''}`}{' '}
          · {rate}% present
        </span>
      </div>
    </div>
  )
}

export const AttendanceTodayWidget: React.FC = () => {
  const { data, isLoading, isError, refetch } = useAttendance()
  return (
    <Card
      title="Attendance today"
      subtitle="Days with no absence marked count as present."
      action={<OpenLink label="Open Attndboard" to="/attnd/attndboard" />}
      className="home-widget"
    >
      {isLoading ? (
        <Loading label="Loading attendance" />
      ) : isError || !data ? (
        <LoadError what="attendance" onRetry={() => void refetch()} />
      ) : (
        <div className="home-stack">
          <PresenceRow
            icon={Users}
            label="Students"
            present={data.students.todayPresent}
            strength={data.students.strength}
            absent={data.students.todayAbsent}
            halfDay={data.students.todayHalfDay}
          />
          <PresenceRow
            icon={UserRound}
            label="Staff"
            present={data.staff.todayPresent}
            strength={data.staff.strength}
            absent={data.staff.todayAbsent}
            halfDay={data.staff.todayHalfDay}
          />
        </div>
      )}
    </Card>
  )
}

export const AttendanceWatchWidget: React.FC = () => {
  const navigate = useNavigate()
  const { data, isLoading, isError, refetch } = useAttendance()
  const workingDays = data?.workingDays || 0
  const sections = (data?.classMatrix || [])
    .flatMap((row) =>
      row.sections.map((cell) => {
        const possible = cell.strength * workingDays
        const rate = possible > 0 ? Math.max(0, Math.round((1 - (cell.monthAbsent + cell.monthHalfDay * 0.5) / possible) * 1000) / 10) : null
        return {
          key: `${row.className}-${cell.section}`,
          name: `${row.className} ${cell.section}`,
          className: row.className,
          section: cell.section,
          rate,
          absences: cell.monthAbsent,
        }
      })
    )
    .filter((item): item is typeof item & { rate: number } => item.rate != null && item.rate < 95)
    .sort((a, b) => a.rate - b.rate)
  const top = sections.slice(0, 5)

  return (
    <Card
      title="Sections to watch"
      subtitle="Lowest attendance this month, below 95%."
      action={<OpenLink label="See all classes" to="/attnd/attndboard" />}
      className="home-widget"
    >
      {isLoading ? (
        <Loading label="Loading attendance" />
      ) : isError ? (
        <LoadError what="attendance" onRetry={() => void refetch()} />
      ) : top.length === 0 ? (
        <EmptyState
          compact
          icon={CheckCircle2}
          title="Every section is at 95% or better"
          body="Sections dropping below 95% this month will show here."
        />
      ) : (
        <ul className="home-list">
          {top.map((item) => (
            <li key={item.key} className="home-list__item">
              <button
                type="button"
                className="home-list__row"
                onClick={() =>
                  navigate(
                    `/attnd/student-attendance?${new URLSearchParams({
                      class: item.className,
                      section: item.section,
                      month: todayKey().slice(0, 7),
                    }).toString()}`
                  )
                }
                aria-label={`Open attendance for ${item.name}, ${item.rate}%`}
              >
                <span className="home-list__name">{item.name}</span>
                <span className="home-list__meta">
                  {formatCount(item.absences)} absence{item.absences === 1 ? '' : 's'}
                </span>
                <Badge tone={item.rate >= 90 ? 'warning' : 'danger'}>{item.rate}%</Badge>
                <Icon icon={ArrowRight} size={16} className="home-list__chev" />
              </button>
            </li>
          ))}
          {sections.length > top.length ? (
            <li className="home-list__more">and {formatCount(sections.length - top.length)} more below 95%</li>
          ) : null}
        </ul>
      )}
    </Card>
  )
}

/* ---------- Fees ---------- */

const useFees = () =>
  useQuery({
    queryKey: ['home', 'cpitl-dashboard'],
    queryFn: () => cpitlService.getDashboard(),
    staleTime: 60_000,
  })

export const FeesWidget: React.FC = () => {
  const { data, isLoading, isError, refetch } = useFees()
  const totals = data?.totals
  // "Due" means up to the end of this month (server figures; older servers fall back to due-by-today).
  const demanded = totals ? totals.demandedThisMonth ?? totals.dueSoFar : 0
  const dueNow = totals ? totals.dueThisMonth ?? Math.max(0, totals.dueSoFar - totals.collected) : 0
  const dueRatePct = demanded > 0 ? Math.max(0, Math.min(100, ((demanded - dueNow) / demanded) * 100)) : 100
  const monthEnd = (() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth() + 1, 0).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  })()
  return (
    <Card
      title="Fee collection"
      subtitle="What has fallen due this session, up to the end of this month."
      action={<OpenLink label="Open fee dashboard" to="/cpitl/dashboard" />}
      className="home-widget"
    >
      {isLoading ? (
        <Loading label="Loading fees" />
      ) : isError || !totals ? (
        <LoadError what="fees" onRetry={() => void refetch()} />
      ) : (
        <div className="home-stack">
          <div className="home-figure">
            <span className="home-figure__value">{formatINR(dueNow, { compact: true })}</span>
            <span className="home-figure__label">due by {monthEnd} · not yet collected</span>
          </div>
          <Progress
            value={Math.round(dueRatePct)}
            label={`${Math.round(dueRatePct)}% of ${formatINR(demanded, { compact: true })} due by ${monthEnd} collected`}
            showValue={false}
            tone={dueRatePct >= 90 ? 'success' : dueRatePct >= 70 ? 'warning' : 'danger'}
          />
          <dl className="home-facts">
            <div>
              <dt>Today</dt>
              <dd>
                {formatINR(data.payments.today, { compact: true })}
                <span className="home-facts__sub"> · {formatCount(data.payments.todayCount)} receipts</span>
              </dd>
            </div>
            <div>
              <dt>Overdue</dt>
              <dd className={totals.overdue > 0 ? 'is-danger' : undefined}>{formatINR(totals.overdue, { compact: true })}</dd>
            </div>
            <div>
              <dt>Pending this session</dt>
              <dd>{formatINR(totals.pending, { compact: true })}</dd>
            </div>
          </dl>
        </div>
      )}
    </Card>
  )
}

export const FeeDefaultersWidget: React.FC = () => {
  const { data, isLoading, isError, refetch } = useFees()
  const rows = (data?.defaulters || []).slice(0, 5)
  return (
    <Card
      title="Overdue fees"
      subtitle="Largest overdue balances."
      action={<OpenLink label="Collect fees" to="/cpitl/collection" />}
      className="home-widget"
    >
      {isLoading ? (
        <Loading label="Loading fees" />
      ) : isError ? (
        <LoadError what="fees" onRetry={() => void refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState compact icon={Wallet} title="No overdue fees" body="Students with unpaid instalments past their due date show here." />
      ) : (
        <ul className="home-list">
          {rows.map((row) => {
            return (
              <li key={row.accountId}>
                <span className="home-list__name">{row.name || 'Student'}</span>
                <span className="home-list__meta">
                  {[row.class, row.section].filter(Boolean).join(' ')} · {formatCount(row.installments)} instalment
                  {row.installments === 1 ? '' : 's'}
                </span>
                <Badge tone="danger" dot={false}>
                  {formatINR(row.overdue, { compact: true })}
                </Badge>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}

/* ---------- Timetable ---------- */

export const TimetableWidget: React.FC = () => {
  const navigate = useNavigate()
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['home', 'timetable-versions'],
    queryFn: () => timetableService.getVersions(),
    staleTime: 60_000,
  })
  const versions = data || []
  const published = versions.find((version) => version.status === 'published')
  const drafts = versions.filter((version) => version.status === 'draft')

  return (
    <Card
      title="Timetable"
      subtitle="What classes are following right now."
      action={<OpenLink label="Class timetables" to="/time-table/class-wise" />}
      className="home-widget"
    >
      {isLoading ? (
        <Loading label="Loading timetable" />
      ) : isError ? (
        <LoadError what="the timetable" onRetry={() => void refetch()} />
      ) : !published && drafts.length === 0 ? (
        <EmptyState
          compact
          icon={CalendarRange}
          title="No timetable yet"
          body="Generate one from your classes, teachers and bell timings."
          action={
            <Button variant="primary" size="sm" onClick={() => navigate('/time-table/generate')}>
              Generate timetable
            </Button>
          }
        />
      ) : (
        <div className="home-stack">
          {published ? (
            <div className="home-tt">
              <Icon icon={CalendarCheck} size={18} className="home-tt__icon" />
              <div className="home-tt__text">
                <span className="home-tt__name">{published.name}</span>
                <span className="home-tt__meta">
                  Published
                  {published.publishedAt ? ` ${new Date(published.publishedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : ''}
                  {' · '}
                  {percent(published.generationStats?.filledSlots ?? 0, published.generationStats?.totalSlots ?? 0)}% filled
                </span>
              </div>
              <Badge tone={published.conflictCount > 0 ? 'warning' : 'success'}>
                {published.conflictCount > 0 ? `${formatCount(published.conflictCount)} conflicts` : 'No conflicts'}
              </Badge>
            </div>
          ) : (
            <div className="home-tt">
              <Icon icon={AlertTriangle} size={18} className="home-tt__icon is-warning" />
              <div className="home-tt__text">
                <span className="home-tt__name">Nothing published</span>
                <span className="home-tt__meta">Publish a draft so teachers and classes can follow it.</span>
              </div>
            </div>
          )}
          <div className="home-tt__foot">
            <Badge tone="neutral" dot={false}>
              {formatCount(drafts.length)} draft{drafts.length === 1 ? '' : 's'}
            </Badge>
            <Button size="sm" onClick={() => navigate('/time-table/generate')}>
              {drafts.length ? 'Review drafts' : 'Generate a new draft'}
            </Button>
          </div>
        </div>
      )}
    </Card>
  )
}

/* ---------- Pinned pages ---------- */

export const PinnedWidget: React.FC<{ pages: LocalEntry[]; onEdit: () => void }> = ({ pages, onEdit }) => {
  const navigate = useNavigate()
  return (
    <Card
      title="Pinned pages"
      action={
        <Button variant="tertiary" size="sm" icon={Settings2} onClick={onEdit}>
          Edit pins
        </Button>
      }
      className="home-widget"
    >
      {pages.length === 0 ? (
        <EmptyState
          compact
          icon={Pin}
          title="Nothing pinned yet"
          body="Pin the pages you open most and they'll wait here."
          action={
            <Button size="sm" icon={Pin} onClick={onEdit}>
              Pin pages
            </Button>
          }
        />
      ) : (
        <ul className="home-pins">
          {pages.map((page) => (
            <li key={page.path}>
              <button type="button" className="home-pin" onClick={() => navigate(page.path)}>
                <span className="home-pin__icon" aria-hidden="true">
                  <Icon icon={page.icon || IndianRupee} size={16} />
                </span>
                <span className="home-pin__text">
                  <span className="home-pin__title">{page.title}</span>
                  {page.subtitle ? <span className="home-pin__sub">{page.subtitle}</span> : null}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
