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
  const [email, setEmail] = useState('admin.capabble')
  const [password, setPassword] = useState('admin.capabble')
  const [currentPath, setCurrentPath] = useState(getInitialPath)

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

  const navItems = useMemo(
    () => [
      { label: 'Tenants', icon: '[]', path: '/', matcher: (path: string) => path === '/' || path.startsWith('/tenants/') },
      { label: 'Subjects', icon: '=', path: '/master-subjects', matcher: (path: string) => path === '/master-subjects' },
      { label: 'Datesheet', icon: '#', path: '/master-datesheet', matcher: (path: string) => path === '/master-datesheet' },
      { label: 'Guidelines', icon: '||', path: '/master-guidelines', matcher: (path: string) => path === '/master-guidelines' },
      { label: 'Undertaking', icon: 'U', path: '/master-undertaking', matcher: (path: string) => path === '/master-undertaking' },
      { label: 'Remuneration', icon: 'Rs', path: '/remuneration', matcher: (path: string) => path === '/remuneration' },
      { label: 'Packing & Dispatch', icon: 'P', path: '/packing-dispatch', matcher: (path: string) => path === '/packing-dispatch' },
      { label: 'Features', icon: 'F', path: '/features', matcher: (path: string) => path.startsWith('/features') },
      { label: 'Rollouts', icon: 'R', path: '/rollouts', matcher: (path: string) => path.startsWith('/rollouts') },
      { label: 'Billing Tenants', icon: '$', path: '/billing/tenants', matcher: (path: string) => path === '/billing/tenants' },
      { label: 'Billing Catalog', icon: '%', path: '/billing/catalog', matcher: (path: string) => path === '/billing/catalog' },
      { label: 'School Directory', icon: 'S', path: '/school-directory', matcher: (path: string) => path === '/school-directory' },
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
      <main className="auth-page">
        <div className="card" style={{ width: '100%', maxWidth: 400 }}>
          <div className="logo">
            <span style={{ color: 'var(--accent)' }}>*</span>
            <span className="logo-text">BECMS ADMIN</span>
          </div>
          <h1 className="card-title">Welcome back</h1>
          <p style={{ color: 'var(--text-secondary)', marginBottom: 24, marginTop: -12 }}>
            Sign in to manage your platform tenants.
          </p>

          {error && <div className="error-text">{error}</div>}

          <form onSubmit={handleLogin} className="grid" style={{ gap: 16 }}>
            <div className="input-group" style={{ marginBottom: 0 }}>
              <label className="input-label">Username</label>
              <input
                type="text"
                placeholder="admin.capabble"
                autoComplete="username"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </div>
            <div className="input-group" style={{ marginBottom: 0 }}>
              <label className="input-label">Password</label>
              <input
                type="password"
                placeholder="admin.capabble"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </div>
            <button type="submit" className="primary" disabled={loading} style={{ marginTop: 8 }}>
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>
        </div>
      </main>
    )
  }

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="logo">
          <span style={{ color: 'var(--accent)' }}>*</span>
          <span className="logo-text">BECMS ADMIN</span>
        </div>

        <nav style={{ flex: 1 }}>
          {navItems.map((item) => (
            <a
              key={item.path}
              href="#"
              className={`nav-link ${item.matcher(currentPath) ? 'active' : ''}`}
              onClick={(event) => {
                event.preventDefault()
                navigateTo(item.path)
              }}
            >
              <span style={{ fontSize: 18 }}>{item.icon}</span>
              <span className="nav-text">{item.label}</span>
            </a>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="user-info">
            <div className="user-avatar">{admin.email[0].toUpperCase()}</div>
            <div className="user-name" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {admin.email}
            </div>
          </div>
          <button className="ghost" onClick={handleLogout} style={{ width: '100%', justifyContent: 'flex-start' }}>
            <span style={{ marginRight: 8 }}>X</span>
            Logout
          </button>
        </div>
      </aside>

      <main className="main-content">{renderPage()}</main>
    </div>
  )
}

export default App
