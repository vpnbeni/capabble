import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  LogOut,
  Map,
  Search,
  School,
  Users,
} from 'lucide-react'
import clsx from 'clsx'
import { useAuth } from '@/context/AuthContext'

const nav = [
  { to: '/schools', label: 'School Directory', icon: School },
  { to: '/collection/new', label: 'Collect Schools', icon: Map },
  { to: '/admin/collection-runs', label: 'Collection Runs', icon: LayoutDashboard },
  { to: '/admin/identity-review', label: 'Identity Review', icon: Users },
]

export function ScholLayout() {
  const { username, logout, authRequired } = useAuth()
  const navigate = useNavigate()

  function handleLogout() {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="flex min-h-screen">
        <aside className="hidden w-64 shrink-0 border-r border-slate-200 bg-white lg:block">
          <div className="border-b border-slate-200 px-6 py-5">
            <div className="text-xl font-bold text-primary-700">Capabble</div>
            <div className="text-xs text-slate-500">School Intelligence</div>
          </div>
          <nav className="space-y-1 p-4">
            <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              School Intelligence
            </div>
            {nav.map((item) => (
              <NavLink
                key={item.label}
                to={item.to}
                className={({ isActive }) =>
                  clsx(
                    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium',
                    isActive ? 'bg-primary-50 text-primary-700' : 'text-slate-600 hover:bg-slate-100',
                  )
                }
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </NavLink>
            ))}
          </nav>
        </aside>

        <div className="flex min-h-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
            <div className="flex items-center gap-4 px-4 py-3 lg:px-8">
              <div className="relative hidden flex-1 md:block">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  className="w-full max-w-xl rounded-lg border border-slate-200 bg-slate-50 py-2 pl-10 pr-4 text-sm"
                  placeholder="Search schools, UDISE, districts..."
                />
              </div>
              <div className="ml-auto flex items-center gap-3">
                {username ? (
                  <span className="hidden text-sm text-slate-500 sm:inline">{username}</span>
                ) : null}
                <div className="rounded-full bg-primary-100 px-3 py-1 text-sm font-medium text-primary-700">
                  SCHOL
                </div>
                {authRequired ? (
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
                    title="Sign out"
                  >
                    <LogOut className="h-4 w-4" />
                    <span className="hidden sm:inline">Sign out</span>
                  </button>
                ) : null}
              </div>
            </div>
          </header>

          <main className="flex-1 px-4 py-6 lg:px-8">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  )
}
