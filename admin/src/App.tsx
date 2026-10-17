import { FormEvent, useEffect, useMemo, useState } from 'react'
import { MasterDatesheetPage } from './pages/MasterDatesheetPage'
import { MasterGuidelinesPage } from './pages/MasterGuidelinesPage'
import { MasterSubjectsPage } from './pages/MasterSubjectsPage'
import { MasterUndertakingPage } from './pages/MasterUndertakingPage'
import { RolloutsPage } from './pages/RolloutsPage'
import { TenantsPage } from './pages/TenantsPage'
import { BillingTenantsPage } from './pages/BillingTenantsPage'
import { BillingCatalogPage } from './pages/BillingCatalogPage'
import { FeaturesPage } from './pages/FeaturesPage'
import { SchoolDirectoryPage } from './pages/SchoolDirectoryPage'
import { RemunerationPage } from './pages/RemunerationPage'
import { PackingDispatchPage } from './pages/PackingDispatchPage'
import { platformAuthApi } from './services/platformApi'
import type { PlatformAdmin } from './types/platform'
import LoginScreen from './components/LoginScreen'
import { ThemeToggle } from './components/ThemeToggle'
import { useTheme } from './theme'
import mark from '@capabble/brand/capabble-mark.svg'
import {
  BookOpen,
  Building2,
  CalendarDays,
  ClipboardCheck,
  CreditCard,
  FileText,
  IndianRupee,
  LogOut,
  MenuIcon,
  Package,
  RefreshCw,
  School,
  Tag,
  ToggleRight,
} from './components/icons'

const getInitialPath = () => window.location.pathname || '/'

const getLoginErrorMessage = (err: unknown): string => {
  if (typeof err === 'object' && err) {
    const response = 'response' in err
      ? (err as {
          response?: {
            status?: number
            statusText?: string
            data?: { message?: string } | string
          }
        }).response
      : undefined

    const responseData = response?.data
    if (typeof responseData === 'string' && responseData.trim()) {
      return responseData
    }

    if (typeof responseData === 'object' && responseData?.message) {
      return responseData.message
    }

    if (response?.status) {
      return response.statusText
        ? `Login failed (${response.status} ${response.statusText})`
        : `Login failed (HTTP ${response.status})`
    }

    if ('message' in err && typeof err.message === 'string' && err.message.trim()) {
      return err.message
    }
  }

  return 'Login failed'
}

function App() {
  const [admin, setAdmin] = useState<PlatformAdmin | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [currentPath, setCurrentPath] = useState(getInitialPath)
  const [navOpen, setNavOpen] = useState(false)
  const { theme, toggle: toggleTheme } = useTheme()

  // The phone drawer closes on Escape and keeps the page behind it still.
  useEffect(() => {
    if (!navOpen) return undefined
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setNavOpen(false)
    }
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = ''
      window.removeEventListener('keydown', onKey)
    }
  }, [navOpen])


  const navigateTo = (path: string) => {
    if (window.location.pathname !== path) {
      window.history.pushState({}, '', path)
    }
    setCurrentPath(path)
  }

  const handleLogout = async () => {
    await platformAuthApi.logout()
    setAdmin(null)
    setEmail('')
    setPassword('')
    setCurrentPath('/')
    if (window.location.pathname !== '/') {
      window.history.pushState({}, '', '/')
    }
  }

  useEffect(() => {
    const onPopState = () => {
      setCurrentPath(getInitialPath())
    }

    window.addEventListener('popstate', onPopState)
    return () => {
      window.removeEventListener('popstate', onPopState)
    }
  }, [])

  useEffect(() => {
    const token = localStorage.getItem('platformToken')
    if (!token) return

    setLoading(true)
    platformAuthApi
      .me()
      .then((result) => {
        setAdmin(result)
      })
      .catch(() => {
        localStorage.removeItem('platformToken')
      })
      .finally(() => {
        setLoading(false)
      })
  }, [])

  const handleLogin = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    setLoading(true)

    try {
      const result = await platformAuthApi.login(email, password)
      setAdmin(result.admin)
      navigateTo('/')
    } catch (err: unknown) {
      setError(getLoginErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  const navGroups = useMemo(
    () => [
      {
        label: 'Schools',
        items: [
          { label: 'Tenants', icon: Building2, path: '/', matcher: (path: string) => path === '/' || path.startsWith('/tenants/') },
          { label: 'School directory', icon: School, path: '/school-directory', matcher: (path: string) => path === '/school-directory' },
          { label: 'Features', icon: ToggleRight, path: '/features', matcher: (path: string) => path.startsWith('/features') },
          { label: 'Rollouts', icon: RefreshCw, path: '/rollouts', matcher: (path: string) => path.startsWith('/rollouts') },
        ],
      },
      {
        label: 'Exam master data',
        items: [
          { label: 'Subjects', icon: BookOpen, path: '/master-subjects', matcher: (path: string) => path === '/master-subjects' },
          { label: 'Datesheet', icon: CalendarDays, path: '/master-datesheet', matcher: (path: string) => path === '/master-datesheet' },
          { label: 'Guidelines', icon: FileText, path: '/master-guidelines', matcher: (path: string) => path === '/master-guidelines' },
          { label: 'Undertaking', icon: ClipboardCheck, path: '/master-undertaking', matcher: (path: string) => path === '/master-undertaking' },
          { label: 'Remuneration', icon: IndianRupee, path: '/remuneration', matcher: (path: string) => path === '/remuneration' },
          { label: 'Packing and dispatch', icon: Package, path: '/packing-dispatch', matcher: (path: string) => path === '/packing-dispatch' },
        ],
      },
      {
        label: 'Billing',
        items: [
          { label: 'Subscriptions', icon: CreditCard, path: '/billing/tenants', matcher: (path: string) => path === '/billing/tenants' },
          { label: 'Prices and plans', icon: Tag, path: '/billing/catalog', matcher: (path: string) => path === '/billing/catalog' },
        ],
      },
    ],
    [],
  )

  const renderPage = () => {
    if (!admin) return null

    if (currentPath === '/' || currentPath.startsWith('/tenants/')) {
      return <TenantsPage admin={admin} navigateTo={navigateTo} currentPath={currentPath} />
    }

    if (currentPath === '/master-subjects') {
      return <MasterSubjectsPage />
    }

    if (currentPath === '/master-datesheet') {
      return <MasterDatesheetPage />
    }

    if (currentPath === '/master-guidelines') {
      return <MasterGuidelinesPage />
    }

    if (currentPath === '/master-undertaking') {
      return <MasterUndertakingPage />
    }

    if (currentPath === '/remuneration') {
      return <RemunerationPage />
    }

    if (currentPath === '/packing-dispatch') {
      return <PackingDispatchPage />
    }

    if (currentPath.startsWith('/rollouts')) {
      return <RolloutsPage />
    }

    if (currentPath.startsWith('/features')) {
      return <FeaturesPage />
    }

    if (currentPath === '/billing/tenants') {
      return <BillingTenantsPage />
    }

    if (currentPath === '/billing/catalog') {
      return <BillingCatalogPage />
    }

    if (currentPath === '/school-directory') {
      return <SchoolDirectoryPage />
    }

    return <TenantsPage admin={admin} navigateTo={navigateTo} currentPath={currentPath} />
  }

  if (!admin) {
    return (
      <LoginScreen
        email={email}
        password={password}
        onEmailChange={setEmail}
        onPasswordChange={setPassword}
        onSubmit={handleLogin}
        loading={loading}
        error={error}
        themeToggle={<ThemeToggle theme={theme} onToggle={toggleTheme} />}
      />
    )
  }

  const go = (path: string) => {
    navigateTo(path)
    setNavOpen(false)
  }

  return (
    <div className={`layout${navOpen ? ' nav-open' : ''}`}>
      <header className="topbar">
        <button type="button" className="icon-button" aria-label="Open menu" aria-expanded={navOpen} onClick={() => setNavOpen(true)}>
          <MenuIcon />
        </button>
        <div className="logo">
          <img src={mark} alt="" />
          <span className="logo-text">Capabble</span>
          <span className="logo-tag">Platform admin</span>
        </div>
        <div className="topbar__end">
          <ThemeToggle theme={theme} onToggle={toggleTheme} />
        </div>
      </header>

      <div className="nav-backdrop" onClick={() => setNavOpen(false)} aria-hidden="true" />

      <aside className="sidebar" aria-label="Platform admin">
        <div className="logo">
          <img src={mark} alt="" />
          <span className="logo-text">Capabble</span>
          <span className="logo-tag">Platform admin</span>
        </div>

        <nav className="nav">
          {navGroups.map((group) => (
            <div key={group.label} className="nav-group">
              <div className="nav-group__label">{group.label}</div>
              {group.items.map((item) => {
                const active = item.matcher(currentPath)
                const ItemIcon = item.icon
                return (
                  <a
                    key={item.path}
                    href={item.path}
                    className={`nav-link${active ? ' active' : ''}`}
                    aria-current={active ? 'page' : undefined}
                    onClick={(event) => {
                      event.preventDefault()
                      go(item.path)
                    }}
                  >
                    <ItemIcon />
                    <span className="nav-text">{item.label}</span>
                  </a>
                )
              })}
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="user-info">
            <div className="user-avatar" aria-hidden="true">{admin.email[0].toUpperCase()}</div>
            <div className="user-name" title={admin.email}>{admin.email}</div>
          </div>
          <ThemeToggle theme={theme} onToggle={toggleTheme} />
          <button type="button" className="icon-button" onClick={handleLogout} aria-label="Sign out" title="Sign out">
            <LogOut />
          </button>
        </div>
      </aside>

      <main className="main-content">{renderPage()}</main>
    </div>
  )
}

export default App
