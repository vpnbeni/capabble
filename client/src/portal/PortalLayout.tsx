import React from 'react'
import { classLabel } from '@/utils/classLabel'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useDispatch } from 'react-redux'
import type { LucideIcon } from 'lucide-react'
import { Bell, Bus, CalendarCheck, CalendarClock, CalendarDays, CalendarRange, GraduationCap, Home, IndianRupee, KeyRound, LogOut, Menu as MenuIcon, Monitor, Moon, Sun, UserRound } from 'lucide-react'
import { Avatar, Menu, Select, type MenuItem } from '@/components/ui'
import { logout } from '@/redux/slices/authSlice'
import type { AppDispatch } from '@/redux/store'
import { useTheme } from '@/utils/theme'
import NotificationBell from '@/components/notifications/NotificationBell'
import { usePortal } from './PortalContext'
import type { PortalSection } from './portalService'
import './portal.css'

interface NavEntry {
  to: string
  label: string
  icon: LucideIcon
  section?: PortalSection
}

const NAV: NavEntry[] = [
  { to: '/portal', label: 'Home', icon: Home },
  { to: '/portal/calendar', label: 'Calendar', icon: CalendarRange, section: 'calendar' },
  { to: '/portal/attendance', label: 'Attendance', icon: CalendarCheck, section: 'attendance' },
  { to: '/portal/timetable', label: 'Timetable', icon: CalendarDays, section: 'timetable' },
  { to: '/portal/results', label: 'Results', icon: GraduationCap, section: 'results' },
  { to: '/portal/fees', label: 'Fees', icon: IndianRupee, section: 'fees' },
  { to: '/portal/notices', label: 'Notices', icon: Bell, section: 'notices' },
  { to: '/portal/transport', label: 'Transport', icon: Bus, section: 'transport' },
  { to: '/portal/appointments', label: 'Meetings', icon: CalendarClock, section: 'appointments' },
  { to: '/portal/profile', label: 'Profile', icon: UserRound, section: 'profile' },
]

const BOTTOM_SLOTS = 4

/** Portal shell: school bar with child switcher, side nav on desktop, bottom nav on phones. */
const PortalLayout: React.FC = () => {
  const dispatch = useDispatch<AppDispatch>()
  const navigate = useNavigate()
  const { home, child, setChildId, isParent, has } = usePortal()
  const { preference, setPreference } = useTheme()

  const entries = NAV.filter((entry) => !entry.section || has(entry.section))
  const bottom = entries.slice(0, BOTTOM_SLOTS)
  const overflow = entries.slice(BOTTOM_SLOTS)

  const signOut = async () => {
    await dispatch(logout())
    navigate('/login', { replace: true })
  }

  const accountItems: MenuItem[] = [
    { label: 'Change password', icon: KeyRound, onSelect: () => navigate('/portal/account') },
    { divider: true },
    { label: 'System theme', icon: Monitor, hint: preference === 'system' ? 'On' : undefined, onSelect: () => setPreference('system') },
    { label: 'Light theme', icon: Sun, hint: preference === 'light' ? 'On' : undefined, onSelect: () => setPreference('light') },
    { label: 'Dark theme', icon: Moon, hint: preference === 'dark' ? 'On' : undefined, onSelect: () => setPreference('dark') },
    { divider: true },
    { label: 'Sign out', icon: LogOut, onSelect: signOut },
  ]

  return (
    <div className="cb-app pt-shell">
      <header className="pt-top">
        <div className="pt-top__school">
          <Avatar name={home.school.name || 'School'} src={home.school.logoUrl} square size="sm" />
          <span className="pt-top__name">{home.school.name}</span>
        </div>
        <div className="pt-top__child">
          {isParent && home.students.length > 1 ? (
            <Select
              aria-label="Child"
              size="sm"
              value={child?.studentId || ''}
              onChange={(event) => setChildId(event.target.value)}
              options={home.students.map((entry) => ({
                value: entry.studentId,
                label: `${entry.name}${entry.className ? ` · ${classLabel(entry.className, entry.section)}` : ''}`,
              }))}
            />
          ) : child ? (
            <span className="pt-top__childname">
              {child.name}{child.className ? ` · ${classLabel(child.className, child.section)}` : ''}
            </span>
          ) : null}
        </div>
        <NotificationBell audience="portal" viewAllPath="/portal/notifications" />
        <Menu items={accountItems} label="Account" />
      </header>

      <div className="pt-body">
        <nav className="pt-nav" aria-label="Portal">
          {entries.map((entry) => (
            <NavLink
              key={entry.to}
              to={entry.to}
              end={entry.to === '/portal'}
              className={({ isActive }) => `pt-nav__link${isActive ? ' is-active' : ''}`}
            >
              <entry.icon size={20} strokeWidth={1.75} aria-hidden="true" />
              {entry.label}
            </NavLink>
          ))}
        </nav>
        <main className="pt-main" id="portal-main">
          <Outlet />
        </main>
      </div>

      <nav className="pt-bottom" aria-label="Portal">
        {bottom.map((entry) => (
          <NavLink
            key={entry.to}
            to={entry.to}
            end={entry.to === '/portal'}
            className={({ isActive }) => `pt-bottom__item${isActive ? ' is-active' : ''}`}
          >
            <entry.icon size={20} strokeWidth={1.75} aria-hidden="true" />
            {entry.label}
          </NavLink>
        ))}
        {overflow.length > 0 ? (
          <Menu
            label="More"
            align="end"
            items={overflow.map((entry) => ({ label: entry.label, icon: entry.icon, onSelect: () => navigate(entry.to) }))}
            trigger={(props) => (
              <button type="button" className="pt-bottom__item" {...props}>
                <MenuIcon size={20} strokeWidth={1.75} aria-hidden="true" />
                More
              </button>
            )}
          />
        ) : null}
      </nav>
    </div>
  )
}

export default PortalLayout
