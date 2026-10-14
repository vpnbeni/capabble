import React, { useEffect, useMemo, useState } from 'react'
import {
  Briefcase,
  CalendarClock,
  ClipboardList,
  FileText,
  Megaphone,
  Plus,
  Presentation,
  ScrollText,
  Users,
} from 'lucide-react'
import {
  Badge,
  Button,
  Card,
  DataTable,
  Dialog,
  EmptyState,
  Page,
  StatCard,
  Tabs,
  TextField,
  formatDate,
  orDash,
  type DataTableColumn,
  type Tone,
} from '@/components/ui'
import '@/components/staaf/recruitment.css'

type VacantPost = {
  id: string
  post: string
  group: string
  vacancies: number
  status: 'Open' | 'On hold' | 'Filled'
}

type Advertisement = {
  id: string
  title: string
  publishedOn: string
  lastDate: string
  medium: string
}

type Application = {
  id: string
  name: string
  post: string
  phone: string
  email: string
  appliedOn: string
  status: 'Received' | 'Shortlisted' | 'Rejected'
}

type ScheduleRow = {
  id: string
  candidate: string
  post: string
  date: string
  time: string
  venue: string
}

type RecruitmentState = {
  vacantPosts: VacantPost[]
  advertisements: Advertisement[]
  applications: Application[]
  interviews: ScheduleRow[]
  demos: ScheduleRow[]
  entranceTests: ScheduleRow[]
}

const STORAGE_KEY = 'staaf:recruitment'

const PROCESS_STEPS = [
  'Vacant post',
  'Advertisement',
  'Application',
  'Entrance test',
  'Demo',
  'Interview',
  'Offer and joining',
]

const SAMPLE: RecruitmentState = {
  vacantPosts: [
    { id: 'vp1', post: 'PGT Mathematics', group: 'Teaching', vacancies: 2, status: 'Open' },
    { id: 'vp2', post: 'TGT English', group: 'Teaching', vacancies: 1, status: 'Open' },
    { id: 'vp3', post: 'Office Clerk', group: 'Admin', vacancies: 1, status: 'On hold' },
    { id: 'vp4', post: 'Security Guard', group: 'Security', vacancies: 3, status: 'Open' },
  ],
  advertisements: [
    { id: 'ad1', title: 'Walk-in for PGT / TGT posts', publishedOn: '2026-08-01', lastDate: '2026-08-25', medium: 'Newspaper + Website' },
    { id: 'ad2', title: 'Security and support staff recruitment', publishedOn: '2026-08-10', lastDate: '2026-08-30', medium: 'School notice board' },
  ],
  applications: [
    { id: 'ap1', name: 'Neha Sharma', post: 'PGT Mathematics', phone: '9876543210', email: 'neha@example.com', appliedOn: '2026-08-12', status: 'Shortlisted' },
    { id: 'ap2', name: 'Rohit Verma', post: 'TGT English', phone: '9811122233', email: 'rohit@example.com', appliedOn: '2026-08-14', status: 'Received' },
  ],
  interviews: [
    { id: 'iv1', candidate: 'Neha Sharma', post: 'PGT Mathematics', date: '2026-08-22', time: '10:00 AM', venue: 'Principal Office' },
  ],
  demos: [
    { id: 'dm1', candidate: 'Neha Sharma', post: 'PGT Mathematics', date: '2026-08-21', time: '09:00 AM', venue: 'Class XII-A' },
  ],
  entranceTests: [
    { id: 'et1', candidate: 'Rohit Verma', post: 'TGT English', date: '2026-08-20', time: '11:00 AM', venue: 'Exam Hall 1' },
  ],
}

const loadState = (): RecruitmentState => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return SAMPLE
    const parsed = JSON.parse(raw) as RecruitmentState
    return { ...SAMPLE, ...parsed }
  } catch {
    return SAMPLE
  }
}

const TABS = [
  { id: 'posts', label: 'Vacant posts' },
  { id: 'ads', label: 'Advertisements' },
  { id: 'form', label: 'Applications' },
  { id: 'interview', label: 'Interviews' },
  { id: 'demo', label: 'Demos' },
  { id: 'test', label: 'Entrance tests' },
] as const

type TabId = (typeof TABS)[number]['id']

const POST_TONE: Record<VacantPost['status'], Tone> = {
  Open: 'info',
  'On hold': 'warning',
  Filled: 'success',
}

const APPLICATION_TONE: Record<Application['status'], Tone> = {
  Received: 'info',
  Shortlisted: 'warning',
  Rejected: 'danger',
}

const TAB_COPY: Record<TabId, { title: string; subtitle: string }> = {
  posts: { title: 'Vacant posts', subtitle: 'Posts the school is recruiting for, with the number of vacancies.' },
  ads: { title: 'Advertisements', subtitle: 'Recruitment notices and where they were published.' },
  form: { title: 'Applications', subtitle: 'Job applications received, newest first.' },
  interview: { title: 'Interview schedule', subtitle: 'Candidates called for interview.' },
  demo: { title: 'Demo schedule', subtitle: 'Demo lessons booked for teaching candidates.' },
  test: { title: 'Entrance test schedule', subtitle: 'Written tests booked for candidates.' },
}

const EMPTY_FORM = { name: '', post: '', phone: '', email: '' }

const StaafRecruitment: React.FC = () => {
  const [state, setState] = useState<RecruitmentState>(SAMPLE)
  const [tab, setTab] = useState<TabId>('posts')
  const [form, setForm] = useState(EMPTY_FORM)
  const [formOpen, setFormOpen] = useState(false)
  const [attempted, setAttempted] = useState(false)

  useEffect(() => {
    setState(loadState())
  }, [])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  }, [state])

  const stats = useMemo(() => {
    const openVacancies = state.vacantPosts
      .filter((post) => post.status === 'Open')
      .reduce((sum, post) => sum + Number(post.vacancies || 0), 0)
    return {
      openVacancies,
      advertisements: state.advertisements.length,
      applications: state.applications.length,
      shortlisted: state.applications.filter((item) => item.status === 'Shortlisted').length,
    }
  }, [state])

  // Open vacancies grouped by staff group, for the tinted tiles above the posts table.
  const groups = useMemo(() => {
    const map = new Map<string, { vacancies: number; posts: number }>()
    state.vacantPosts
      .filter((post) => post.status === 'Open')
      .forEach((post) => {
        const key = post.group || 'Other'
        const entry = map.get(key) || { vacancies: 0, posts: 0 }
        entry.vacancies += Number(post.vacancies || 0)
        entry.posts += 1
        map.set(key, entry)
      })
    return Array.from(map.entries()).map(([name, value]) => ({ name, ...value }))
  }, [state.vacantPosts])

  const submitApplication = (event: React.FormEvent) => {
    event.preventDefault()
    setAttempted(true)
    if (!form.name.trim() || !form.post.trim()) return
    const next: Application = {
      id: `ap_${Date.now()}`,
      name: form.name.trim(),
      post: form.post.trim(),
      phone: form.phone.trim(),
      email: form.email.trim(),
      appliedOn: new Date().toISOString().slice(0, 10),
      status: 'Received',
    }
    setState((prev) => ({ ...prev, applications: [next, ...prev.applications] }))
    setForm(EMPTY_FORM)
    setTab('form')
    setAttempted(false)
    setFormOpen(false)
  }

  const closeForm = () => {
    setFormOpen(false)
    setAttempted(false)
  }

  const nameError = attempted && !form.name.trim() ? 'Enter the applicant’s name.' : undefined
  const postError = attempted && !form.post.trim() ? 'Enter the post they are applying for.' : undefined

  const postColumns: DataTableColumn<VacantPost>[] = [
    { key: 'post', header: 'Post', mobile: 'title', render: (row) => <span className="recruit-cell-title">{orDash(row.post)}</span> },
    { key: 'group', header: 'Group', mobile: 'subtitle', render: (row) => (row.group ? <Badge tone="neutral" dot={false}>{row.group}</Badge> : '—') },
    { key: 'vacancies', header: 'Vacancies', numeric: true, align: 'right', render: (row) => Number(row.vacancies || 0) },
    { key: 'status', header: 'Status', mobile: 'aside', render: (row) => <Badge tone={POST_TONE[row.status] || 'neutral'}>{row.status}</Badge> },
  ]

  const adColumns: DataTableColumn<Advertisement>[] = [
    { key: 'title', header: 'Title', mobile: 'title', render: (row) => <span className="recruit-cell-title">{orDash(row.title)}</span> },
    { key: 'medium', header: 'Published in', mobile: 'subtitle', render: (row) => orDash(row.medium) },
    { key: 'publishedOn', header: 'Published on', render: (row) => formatDate(row.publishedOn) },
    { key: 'lastDate', header: 'Last date', mobile: 'aside', render: (row) => formatDate(row.lastDate) },
  ]

  const applicationColumns: DataTableColumn<Application>[] = [
    {
      key: 'name',
      header: 'Applicant',
      mobile: 'title',
      render: (row) => (
        <>
          <span className="recruit-cell-title">{orDash(row.name)}</span>
          {row.email ? <span className="recruit-cell-sub">{row.email}</span> : null}
        </>
      ),
    },
    { key: 'post', header: 'Post', mobile: 'subtitle', render: (row) => orDash(row.post) },
    { key: 'phone', header: 'Phone', numeric: true, render: (row) => orDash(row.phone) },
    { key: 'appliedOn', header: 'Applied on', render: (row) => formatDate(row.appliedOn) },
    { key: 'status', header: 'Status', mobile: 'aside', render: (row) => <Badge tone={APPLICATION_TONE[row.status] || 'neutral'}>{row.status}</Badge> },
  ]

  const scheduleColumns: DataTableColumn<ScheduleRow>[] = [
    { key: 'candidate', header: 'Candidate', mobile: 'title', render: (row) => <span className="recruit-cell-title">{orDash(row.candidate)}</span> },
    { key: 'post', header: 'Post', mobile: 'subtitle', render: (row) => orDash(row.post) },
    { key: 'date', header: 'Date', mobile: 'aside', render: (row) => formatDate(row.date) },
    { key: 'time', header: 'Time', numeric: true, render: (row) => orDash(row.time) },
    { key: 'venue', header: 'Venue', render: (row) => orDash(row.venue) },
  ]

  const counts: Record<TabId, number> = {
    posts: state.vacantPosts.length,
    ads: state.advertisements.length,
    form: state.applications.length,
    interview: state.interviews.length,
    demo: state.demos.length,
    test: state.entranceTests.length,
  }

  const scheduleTable = (rows: ScheduleRow[], caption: string, icon: typeof Users, emptyTitle: string, emptyBody: string) => (
    <DataTable
      columns={scheduleColumns}
      rows={rows}
      getRowKey={(row) => row.id}
      caption={caption}
      empty={<EmptyState icon={icon} title={emptyTitle} body={emptyBody} compact />}
    />
  )

  return (
    <Page width="full">
      <section className="cb-stats" aria-label="Recruitment totals">
        <StatCard icon={Briefcase} label="Open vacancies" value={stats.openVacancies} hint="Across posts marked open" />
        <StatCard icon={Megaphone} label="Advertisements" value={stats.advertisements} hint="Notices published" />
        <StatCard icon={ClipboardList} label="Applications" value={stats.applications} hint="Received so far" />
        <StatCard icon={Users} label="Shortlisted" value={stats.shortlisted} hint="Moved to test, demo or interview" />
      </section>

      <Card title="Process flow" subtitle="The standard path from a vacant post to joining.">
        <ol className="recruit-steps" aria-label="Recruitment steps">
          {PROCESS_STEPS.map((step, index) => (
            <li key={step} className="recruit-step">
              <span className="recruit-step__num">{index + 1}</span>
              {step}
              {index < PROCESS_STEPS.length - 1 ? <span className="recruit-step__sep" aria-hidden="true" /> : null}
            </li>
          ))}
        </ol>
      </Card>

      <Card
        title={TAB_COPY[tab].title}
        subtitle={TAB_COPY[tab].subtitle}
        action={
          tab === 'form' ? (
            <Button variant="primary" icon={Plus} onClick={() => setFormOpen(true)}>
              Add application
            </Button>
          ) : null
        }
      >
        <Tabs
          className="recruit-tabs"
          label="Recruitment records"
          items={TABS.map((item) => ({ id: item.id, label: item.label, count: counts[item.id] }))}
          value={tab}
          onChange={(id) => setTab(id as TabId)}
        />

        {tab === 'posts' ? (
          <>
            {groups.length ? (
              <ul className="recruit-groups" aria-label="Open vacancies by group">
                {groups.map((group, index) => (
                  <li key={group.name} className={`recruit-group recruit-group--c${(index % 6) + 1}`}>
                    <span className="recruit-group__name">{group.name}</span>
                    <span className="recruit-group__count">{group.vacancies}</span>
                    <span className="recruit-group__meta">
                      {group.posts} {group.posts === 1 ? 'post' : 'posts'} open
                    </span>
                    <span className="recruit-group__bar" aria-hidden="true">
                      <span style={{ width: `${stats.openVacancies ? Math.round((group.vacancies / stats.openVacancies) * 100) : 0}%` }} />
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
            <DataTable
              columns={postColumns}
              rows={state.vacantPosts}
              getRowKey={(row) => row.id}
              caption="Vacant posts"
              empty={<EmptyState icon={Briefcase} title="No vacant posts recorded" body="Posts you are recruiting for will be listed here." compact />}
            />
          </>
        ) : null}

        {tab === 'ads' ? (
          <DataTable
            columns={adColumns}
            rows={state.advertisements}
            getRowKey={(row) => row.id}
            caption="Advertisements"
            empty={<EmptyState icon={Megaphone} title="No advertisements published yet" body="Recruitment notices will be listed here once published." compact />}
          />
        ) : null}

        {tab === 'form' ? (
          <DataTable
            columns={applicationColumns}
            rows={state.applications}
            getRowKey={(row) => row.id}
            caption="Applications"
            empty={
              <EmptyState
                icon={FileText}
                title="No applications received yet"
                body="Add an application when a candidate applies for a post."
                action={
                  <Button icon={Plus} onClick={() => setFormOpen(true)}>
                    Add application
                  </Button>
                }
                compact
              />
            }
          />
        ) : null}

        {tab === 'interview'
          ? scheduleTable(state.interviews, 'Interview schedule', ScrollText, 'No interviews scheduled', 'Shortlisted candidates called for interview will appear here.')
          : null}
        {tab === 'demo'
          ? scheduleTable(state.demos, 'Demo schedule', Presentation, 'No demos scheduled', 'Demo lessons booked for candidates will appear here.')
          : null}
        {tab === 'test'
          ? scheduleTable(state.entranceTests, 'Entrance test schedule', CalendarClock, 'No entrance tests scheduled', 'Written tests booked for candidates will appear here.')
          : null}
      </Card>

      <Dialog
        open={formOpen}
        onClose={closeForm}
        title="Add application"
        description="Record a job application. It is added with the status Received."
        footer={
          <>
            <Button onClick={closeForm}>Cancel</Button>
            <Button variant="primary" type="submit" form="recruit-application-form">
              Save application
            </Button>
          </>
        }
      >
        <form id="recruit-application-form" className="cb-form-grid" onSubmit={submitApplication} noValidate>
          <TextField
            label="Applicant name"
            required
            value={form.name}
            error={nameError}
            onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
            autoFocus
          />
          <TextField
            label="Post applied for"
            required
            placeholder="e.g. PGT Mathematics"
            value={form.post}
            error={postError}
            onChange={(event) => setForm((prev) => ({ ...prev, post: event.target.value }))}
          />
          <TextField
            label="Phone"
            type="tel"
            inputMode="tel"
            value={form.phone}
            onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))}
          />
          <TextField
            label="Email"
            type="email"
            value={form.email}
            onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
          />
        </form>
      </Dialog>
    </Page>
  )
}

export default StaafRecruitment
