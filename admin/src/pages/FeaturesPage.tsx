import { useCallback, useEffect, useMemo, useState } from 'react'
import { featuresAdminApi } from '../services/platformApi'
import type { TenantFeaturePage, TenantWithFeatureSummary } from '../types/platform'
import { Dialog } from '../components/Dialog'
import { MODULE_REGISTRY } from '@capabble/modules'
import { ChevronRight, LayoutGrid, Search } from '../components/icons'

const SUPPLEMENTAL_FEATURE_PAGES: TenantFeaturePage[] = [
  { key: 'pwd_info', label: 'PwD Info', path: '/pwd-info', group: 'Centre Records', module: 'cntr' },
  { key: 'umcs', label: "UMC's", path: '/umcs', group: 'Centre Records', module: 'cntr' },
  { key: 'stickers', label: 'Stickers', path: '/stickers', group: 'Centre Records', module: 'cntr' },
  { key: 'performas', label: "Performa's", path: '/performas', group: 'Centre Records', module: 'cntr' },
  { key: 'candidates', label: 'Candidate Details', path: '/candidate-details', group: 'Centre Records', module: 'cntr' },
  { key: 'dispatch_slip', label: 'Dispatch Slip', path: '/dispatch-slip', group: 'Centre Records', module: 'cntr' },
  { key: 'remuneration', label: 'Remuneration', path: '/remuneration', group: 'Centre Records', module: 'cntr' },
]

/** Order on this page, with one line on what each module covers. */
const MODULES: Array<{ key: string; description: string }> = [
  { key: 'core', description: 'Dashboard, billing and account settings' },
  { key: 'stdnt', description: 'Student records, classes and alumni' },
  { key: 'staaf', description: 'Staff records' },
  { key: 'attnd', description: 'Student and staff attendance' },
  { key: 'timetable', description: 'Timetable, bell timings and allocation' },
  { key: 'acdmc', description: 'Curriculum, lesson plans and homework' },
  { key: 'exmcl', description: 'School exams, results and report cards' },
  { key: 'cntr', description: 'CBSE exam centre operations' },
  { key: 'actvt', description: 'Houses, clubs and events' },
  { key: 'appnt', description: 'Parent, visitor and staff meetings' },
  { key: 'cpitl', description: 'Fees, expenses and payroll' },
  { key: 'trnst', description: 'Vehicles and routes' },
  { key: 'libry', description: 'Catalogue and circulation' },
  { key: 'asets', description: 'School assets and stock' },
  { key: 'mdcl', description: 'Medical cases and supplies' },
]

// Codes, names and icons come from the school app's module switcher, so both apps match.
const REGISTRY = new Map(MODULE_REGISTRY.map((module) => [module.id as string, module]))
const moduleIdentity = (key: string) => {
  const entry = REGISTRY.get(key)
  if (entry) return { code: entry.abbreviation, label: entry.title, icon: entry.icon as string | null }
  if (key === 'core') return { code: 'CORE', label: 'Core', icon: null }
  return { code: key.toUpperCase(), label: key, icon: null }
}

const DEFAULT_TARGET = 'default'

const mergeFeaturePages = (pages: TenantFeaturePage[]): TenantFeaturePage[] => {
  const byKey = new Map<string, TenantFeaturePage>()
  pages.forEach((page) => byKey.set(page.key, page))
  SUPPLEMENTAL_FEATURE_PAGES.forEach((page) => {
    if (!byKey.has(page.key)) byKey.set(page.key, page)
  })
  return Array.from(byKey.values())
}

/** "ExmCl - Centre Details" → "Centre details"; "Time Table - Classes" → "Classes". */
const pageName = (label: string) => {
  const name = label.includes(' - ') ? label.slice(label.indexOf(' - ') + 3) : label
  return name.charAt(0).toUpperCase() + name.slice(1)
}

const errorMessage = (err: unknown, fallback: string) =>
  (err as { response?: { data?: { message?: string } } })?.response?.data?.message || fallback

const isOn = (toggles: Record<string, boolean>, key: string) => toggles[key] !== false

/** Design-system switch; `mixed` shows a module with some pages on. */
function Switch({ checked, mixed = false, label, disabled, onChange }: {
  checked: boolean
  mixed?: boolean
  label: string
  disabled?: boolean
  onChange: (next: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={mixed ? 'mixed' : checked}
      aria-label={label}
      disabled={disabled}
      className={`cb-switch__track${checked ? ' is-on' : ''}${mixed ? ' is-mixed' : ''}`}
      onClick={(event) => {
        event.stopPropagation()
        onChange(mixed ? true : !checked)
      }}
    >
      <span className="cb-switch__thumb" />
    </button>
  )
}

export function FeaturesPage() {
  const [pages, setPages] = useState<TenantFeaturePage[]>([])
  const [tenants, setTenants] = useState<TenantWithFeatureSummary[]>([])
  const [target, setTarget] = useState<string>(DEFAULT_TARGET)
  const [toggles, setToggles] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [confirmOff, setConfirmOff] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const isDefault = target === DEFAULT_TARGET
  const tenant = tenants.find((row) => row._id === target) || null
  const targetName = isDefault ? 'new schools' : tenant?.name || tenant?.slug || 'this school'

  const flash = (message: string) => {
    setNotice(message)
    window.setTimeout(() => setNotice(''), 2500)
  }

  // Pages and schools once; the toggles each time the target changes.
  useEffect(() => {
    Promise.all([featuresAdminApi.listPages(), featuresAdminApi.listTenants('')])
      .then(([pageList, tenantList]) => {
        setPages(mergeFeaturePages(pageList))
        setTenants(tenantList)
      })
      .catch((err) => setError(errorMessage(err, "Couldn't load features.")))
  }, [])

  useEffect(() => {
    setLoading(true)
    setError('')
    const load = isDefault ? featuresAdminApi.getDefaultFeatures() : featuresAdminApi.getTenantFeatures(target)
    load
      .then((response) => setToggles(response.toggles))
      .catch((err) => setError(errorMessage(err, "Couldn't load this school's features.")))
      .finally(() => setLoading(false))
  }, [target, isDefault])

  const save = useCallback(async (next: Record<string, boolean>, message: string) => {
    const previous = toggles
    setToggles(next)
    setSaving(true)
    setError('')
    try {
      const response = isDefault
        ? await featuresAdminApi.updateDefaultFeatures(next)
        : await featuresAdminApi.updateTenantFeatures(target, next)
      setToggles(response.toggles)
      flash(message)
      if (!isDefault) featuresAdminApi.listTenants('').then(setTenants).catch(() => undefined)
    } catch (err) {
      setToggles(previous)
      setError(errorMessage(err, "Couldn't save. Nothing was changed."))
    } finally {
      setSaving(false)
    }
  }, [toggles, isDefault, target])

  const modules = useMemo(() => {
    const known = new Set(MODULES.map((m) => m.key))
    const extra = [...new Set(pages.map((p) => p.module))].filter((key) => !known.has(key))
    return [...MODULES, ...extra.map((key) => ({ key, description: '' }))]
      .map((module) => ({ ...module, ...moduleIdentity(module.key), pages: pages.filter((p) => p.module === module.key) }))
      .filter((module) => module.pages.length > 0)
  }, [pages])

  const needle = query.trim().toLowerCase()
  const visibleModules = useMemo(() => {
    if (!needle) return modules
    return modules
      .map((module) => (`${module.code} ${module.label}`.toLowerCase().includes(needle)
        ? module
        : { ...module, pages: module.pages.filter((p) => p.label.toLowerCase().includes(needle)) }))
      .filter((module) => module.pages.length > 0)
  }, [modules, needle])

  const totalOn = pages.filter((p) => isOn(toggles, p.key)).length

  const setMany = (keys: string[], value: boolean) => {
    const next = { ...toggles }
    keys.forEach((key) => { next[key] = value })
    return next
  }

  return (
    <div className="grid" style={{ gap: 24 }}>
      <header className="page-header">
        <h1 className="section-title">Features</h1>
        <p className="page-subtitle">Choose which modules and pages a school can use, or what new schools start with.</p>
      </header>

      <section className="card admin-list-card">
        <div className="ft-toolbar">
          <label className="ft-target">
            <span className="input-label">Settings for</span>
            <select value={target} onChange={(event) => { setTarget(event.target.value); setExpanded({}) }}>
              <option value={DEFAULT_TARGET}>New schools (default)</option>
              {tenants.map((row) => (
                <option key={row._id} value={row._id}>
                  {row.name || row.slug} ({row.slug})
                </option>
              ))}
            </select>
          </label>

          <div className="ft-search">
            <Search size={16} className="ft-search__icon" />
            <input
              type="search"
              aria-label="Find a module or page"
              placeholder="Find a module or page"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>

          <div className="ft-bulk">
            <span className="admin-count">{loading ? 'Loading…' : `${totalOn} of ${pages.length} pages on`}</span>
            <button type="button" className="ghost" disabled={loading || saving} onClick={() => setConfirmOff(true)}>
              Turn all off
            </button>
            <button
              type="button"
              className="secondary"
              disabled={loading || saving}
              onClick={() => save(setMany(pages.map((p) => p.key), true), `Everything is on for ${targetName}.`)}
            >
              Turn all on
            </button>
          </div>
        </div>

        {isDefault ? (
          <p className="ft-note">Only schools created from now on start with these settings. Existing schools keep theirs.</p>
        ) : null}
        {error ? <div className="error-text ft-message" role="alert">{error}</div> : null}
        {notice ? <div className="success-text ft-message" role="status">{notice}</div> : null}

        <ul className="ft-modules" aria-busy={loading}>
          {visibleModules.map((module) => {
            const on = module.pages.filter((p) => isOn(toggles, p.key)).length
            const all = on === module.pages.length
            const none = on === 0
            const single = module.pages.length === 1
            const open = Boolean(expanded[module.key] || (needle && !single))
            return (
              <li key={module.key} className={`ft-module${open ? ' is-open' : ''}`}>
                <div
                  className={`ft-module__row${single ? '' : ' is-expandable'}`}
                  onClick={single ? undefined : () => setExpanded((prev) => ({ ...prev, [module.key]: !prev[module.key] }))}
                >
                  {single ? <span className="ft-module__spacer" /> : (
                    <button
                      type="button"
                      className="icon-button ft-module__chevron"
                      aria-expanded={open}
                      aria-label={`${open ? 'Hide' : 'Show'} ${module.code} ${module.label} pages`}
                      onClick={(event) => {
                        event.stopPropagation()
                        setExpanded((prev) => ({ ...prev, [module.key]: !prev[module.key] }))
                      }}
                    >
                      <ChevronRight size={16} />
                    </button>
                  )}
                  <span className="ft-module__icon" aria-hidden="true">
                    {module.icon ? <img src={module.icon} alt="" /> : <LayoutGrid size={18} />}
                  </span>
                  <div className="ft-module__text">
                    <span className="ft-module__name"><strong>{module.code}</strong> {module.label}</span>
                    <span className="ft-module__meta">
                      {single ? module.description : `${on} of ${module.pages.length} pages on${module.description ? ` · ${module.description}` : ''}`}
                    </span>
                  </div>
                  <Switch
                    checked={!none}
                    mixed={!all && !none}
                    label={`${module.code} ${module.label} for ${targetName}`}
                    disabled={loading || saving}
                    onChange={(next) => save(
                      setMany(module.pages.map((p) => p.key), next),
                      `${module.code} ${module.label} turned ${next ? 'on' : 'off'} for ${targetName}.`,
                    )}
                  />
                </div>

                {open && !single ? (
                  <ul className="ft-pages">
                    {module.pages.map((page) => {
                      const pageOn = isOn(toggles, page.key)
                      return (
                        <li key={page.key} className="ft-page">
                          <span className="ft-page__name" title={page.path}>{pageName(page.label)}</span>
                          <Switch
                            checked={pageOn}
                            label={`${pageName(page.label)} for ${targetName}`}
                            disabled={loading || saving}
                            onChange={(next) => save({ ...toggles, [page.key]: next }, `${pageName(page.label)} turned ${next ? 'on' : 'off'}.`)}
                          />
                        </li>
                      )
                    })}
                  </ul>
                ) : null}
              </li>
            )
          })}
          {!loading && visibleModules.length === 0 ? (
            <li className="cb-empty cb-empty--compact">
              <p className="cb-empty__title">Nothing matches "{query}"</p>
              <p className="cb-empty__body">Try a module code or name, such as CPITL or Attendance.</p>
            </li>
          ) : null}
        </ul>
      </section>

      <Dialog isOpen={confirmOff} onClose={() => setConfirmOff(false)} title={`Turn everything off for ${targetName}?`}>
        <p style={{ marginTop: 0, color: 'var(--ink-muted)' }}>
          {isDefault
            ? 'New schools will start with every page hidden until you turn modules on.'
            : 'Staff at this school lose access to every page straight away. You can turn modules back on at any time.'}
        </p>
        <div className="form-actions">
          <button type="button" className="ghost" onClick={() => setConfirmOff(false)}>Keep as is</button>
          <button
            type="button"
            className="danger"
            onClick={() => {
              setConfirmOff(false)
              save(setMany(pages.map((p) => p.key), false), `Everything is off for ${targetName}.`)
            }}
          >
            Turn everything off
          </button>
        </div>
      </Dialog>
    </div>
  )
}
