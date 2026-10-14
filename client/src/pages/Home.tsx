import React, { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSelector } from 'react-redux'
import { LayoutDashboard, Settings2 } from 'lucide-react'
import { Button, EmptyState, Page } from '@/components/ui'
import { selectUser } from '@/redux/slices/authSlice'
import { useSchoolProfile } from '@/hooks/useSchoolProfile'
import { useLocalIndex } from '@/components/commandPalette/useLocalIndex'
import { MODULE_REGISTRY } from '@/constants/moduleRegistry'
import { resolveTenantSlug } from '@/utils/tenantRuntime'
import {
  ALL_WIDGETS,
  homeLayoutKey,
  saveHomeLayout,
  useHomeLayout,
  type HomeLayout,
  type WidgetId,
} from '@/components/home/homeLayout'
import {
  AttendanceTodayWidget,
  AttendanceWatchWidget,
  FeeDefaultersWidget,
  FeesWidget,
  PinnedWidget,
  QuickActionsWidget,
  TimetableWidget,
  WIDGETS,
} from '@/components/home/HomeWidgets'
import { HomeCustomize, type CustomizeTab } from '@/components/home/HomeCustomize'
import { QUICK_ACTIONS } from '@/components/home/quickActions'
import '@/components/home/home.css'

const greeting = () => {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

const Home: React.FC = () => {
  const navigate = useNavigate()
  const user = useSelector(selectUser)
  const { data: school } = useSchoolProfile(Boolean(user))
  const { pages, modules, pageByPath } = useLocalIndex()
  const storageKey = homeLayoutKey(resolveTenantSlug(), user?._id)
  const layout = useHomeLayout(storageKey)
  const [customize, setCustomize] = useState<null | CustomizeTab>(null)

  // Widgets the school can use: those without a data page, or whose page is open to it.
  const availableWidgets = useMemo(
    () => ALL_WIDGETS.filter((id) => !WIDGETS[id].requiresPath || pageByPath.has(WIDGETS[id].requiresPath!)),
    [pageByPath]
  )
  const visibleWidgets = layout.widgets.filter((id) => availableWidgets.includes(id))
  const availableActions = useMemo(() => QUICK_ACTIONS.filter((action) => pageByPath.has(action.path)), [pageByPath])
  const shownActions = layout.actions
    .map((id) => availableActions.find((action) => action.id === id))
    .filter((action): action is NonNullable<typeof action> => Boolean(action))
  const pinnedPages = layout.pinned.map((path) => pageByPath.get(path)).filter((page): page is NonNullable<typeof page> => Boolean(page))

  const launcher = useMemo(
    () =>
      modules
        .map((entry) => {
          const def = MODULE_REGISTRY.find((module) => module.id === entry.module)
          return def ? { ...def, path: entry.path } : null
        })
        .filter((item): item is NonNullable<typeof item> => Boolean(item)),
    [modules]
  )

  const handleSave = (next: HomeLayout) => {
    saveHomeLayout(storageKey, next)
    setCustomize(null)
  }

  const renderWidget = (id: WidgetId) => {
    switch (id) {
      case 'quick-actions':
        return <QuickActionsWidget actions={shownActions} onEdit={() => setCustomize('actions')} />
      case 'attendance-today':
        return <AttendanceTodayWidget />
      case 'attendance-watch':
        return <AttendanceWatchWidget />
      case 'fees':
        return <FeesWidget />
      case 'fee-defaulters':
        return <FeeDefaultersWidget />
      case 'timetable':
        return <TimetableWidget />
      case 'pinned':
        return <PinnedWidget pages={pinnedPages} onEdit={() => setCustomize('pins')} />
      default:
        return null
    }
  }

  const today = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const schoolName = String(school?.name || '').trim()

  return (
    <Page>
      <div className="home-hello">
        <div className="home-hello__text">
          <h2 className="home-hello__title">{greeting()}</h2>
          <p className="home-hello__sub">
            {today}
            {schoolName ? ` · ${schoolName}` : ''}
          </p>
        </div>
        <Button icon={Settings2} onClick={() => setCustomize('widgets')}>
          Customize
        </Button>
      </div>

      {launcher.length > 0 ? (
        <nav className="home-modules" aria-label="Open a module">
          <span className="home-modules__label">Modules</span>
          <ul className="home-modules__list">
            {launcher.map((module) => (
              <li key={module.id}>
                <button
                  type="button"
                  className="home-module"
                  onClick={() => navigate(module.path)}
                  title={`${module.abbreviation} · ${module.title}`}
                >
                  <img src={module.icon} alt="" className="home-module__icon" />
                  <span className="home-module__text">
                    <span className="home-module__abbr">{module.abbreviation}</span>
                    <span className="home-module__name">{module.title}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}

      {visibleWidgets.length === 0 ? (
        <EmptyState
          icon={LayoutDashboard}
          title="Your Home is empty"
          body="Add widgets for attendance, fees, the timetable or the pages you use most."
          action={
            <Button variant="primary" icon={Settings2} onClick={() => setCustomize('widgets')}>
              Add widgets
            </Button>
          }
        />
      ) : (
        <div className="home-grid">
          {visibleWidgets.map((id) => (
            <div key={id} className={WIDGETS[id].wide ? 'home-grid__item is-wide' : 'home-grid__item'}>
              {renderWidget(id)}
            </div>
          ))}
        </div>
      )}

      <HomeCustomize
        open={customize !== null}
        initialTab={customize || 'widgets'}
        layout={layout}
        availableWidgets={availableWidgets}
        availableActions={availableActions}
        pages={pages}
        onClose={() => setCustomize(null)}
        onSave={handleSave}
      />
    </Page>
  )
}

export default Home
