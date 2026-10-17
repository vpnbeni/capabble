import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import type { LucideIcon } from 'lucide-react'
import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  CalendarDays,
  ClipboardList,
  Clock,
  CornerDownLeft,
  DoorOpen,
  FileText,
  GraduationCap,
  History,
  Loader2,
  Package,
  Receipt,
  School,
  Search,
  TrendingUp,
  UserRound,
  X,
  Zap,
} from 'lucide-react'
import { OverlayShell } from '@/components/ui/overlays'
import { useAcademicSession } from '@/contexts/AcademicSessionContext'
import searchService, { type SearchRecordType } from '@/services/searchService'
import { getTenantHeader } from '@/utils/tenantRuntime'
import { isMacPlatform } from './platform'
import { scoreSearchable, type MatchRange } from './fuzzy'
import {
  addRecentItem,
  addRecentSearch,
  clearHistory,
  readMemory,
  removeRecentSearch,
  topVisitedPaths,
  type StoredItem,
} from './storage'
import { useLocalIndex, type LocalEntry } from './useLocalIndex'
import './command-palette.css'

const REMOTE_DEBOUNCE_MS = 150
const MIN_REMOTE_QUERY = 2
const LOCAL_LIMIT = 6
const LOCAL_LIMIT_FILTERED = 30

const RECORD_ICONS: Record<SearchRecordType, LucideIcon> = {
  student: GraduationCap,
  staff: UserRound,
  receipt: Receipt,
  asset: Package,
  subject: BookOpen,
  room: DoorOpen,
  alumni: School,
  candidate: ClipboardList,
  appointment: CalendarDays,
}

type Filter = 'all' | 'pages' | SearchRecordType

type Row = {
  key: string
  kind: 'page' | 'module' | 'action' | 'record' | 'recent-search'
  title: string
  subtitle?: string
  path?: string
  query?: string
  icon?: LucideIcon
  image?: string
  badge?: string
  ranges?: MatchRange[]
  hint?: string
  recordType?: SearchRecordType
  run?: LocalEntry['run']
}

type Section = {
  id: string
  label: string
  rows: Row[]
  loading?: boolean
  /** Small pill beside the heading, e.g. "Closest matches" for typo-tolerant results. */
  tag?: string
  action?: { label: string; onClick: () => void }
}

const useDebouncedValue = <T,>(value: T, delay: number) => {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay)
    return () => window.clearTimeout(timer)
  }, [value, delay])
  return debounced
}

const Highlight: React.FC<{ text: string; ranges?: MatchRange[] }> = ({ text, ranges }) => {
  if (!ranges?.length) return <>{text}</>
  const merged = [...ranges].sort((a, b) => a[0] - b[0])
  const parts: React.ReactNode[] = []
  let cursor = 0
  merged.forEach(([start, end], index) => {
    if (start < cursor) return
    if (start > cursor) parts.push(text.slice(cursor, start))
    parts.push(<mark key={index} className="cb-cmdk__hl">{text.slice(start, end)}</mark>)
    cursor = end
  })
  if (cursor < text.length) parts.push(text.slice(cursor))
  return <>{parts}</>
}

const localToRow = (entry: LocalEntry, ranges?: MatchRange[]): Row => ({
  key: entry.id,
  kind: entry.kind,
  title: entry.title,
  subtitle: entry.subtitle,
  path: entry.path,
  icon: entry.icon,
  image: entry.image,
  ranges,
  run: entry.run,
  hint: entry.kind === 'module' ? 'Module' : entry.kind === 'action' ? 'Action' : 'Page',
})

const storedToRow = (item: StoredItem): Row => ({
  key: `recent:${item.path}`,
  kind: item.kind,
  title: item.title,
  subtitle: item.subtitle,
  path: item.path,
  recordType: item.type as SearchRecordType | undefined,
  icon: item.kind === 'record' && item.type ? RECORD_ICONS[item.type as SearchRecordType] : item.kind === 'action' ? Zap : FileText,
})

interface CommandPaletteProps {
  open: boolean
  onClose: () => void
  storageKey: string
}

const CommandPalette: React.FC<CommandPaletteProps> = ({ open, onClose, storageKey }) => {
  const navigate = useNavigate()
  const { currentSession, clearSession } = useAcademicSession()
  const { entries, pageByPath, actions, recordFilters } = useLocalIndex()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [activeIndex, setActiveIndex] = useState(0)
  const [memory, setMemory] = useState(() => readMemory(storageKey))
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  // Last real pointer position: Chrome fires mousemove when the list scrolls under a still cursor.
  const pointerRef = useRef<{ x: number; y: number } | null>(null)
  const baseId = useId()
  const listId = `${baseId}-list`
  const isMac = useMemo(isMacPlatform, [])

  // Fresh state each time the palette opens.
  useEffect(() => {
    if (!open) return
    setQuery('')
    setFilter('all')
    setActiveIndex(0)
    setMemory(readMemory(storageKey))
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus())
    return () => window.cancelAnimationFrame(frame)
  }, [open, storageKey])

  const trimmed = query.trim()
  const debouncedQuery = useDebouncedValue(trimmed, REMOTE_DEBOUNCE_MS)
  const remoteTypes = filter === 'all' || filter === 'pages' ? undefined : [filter]
  const remoteEnabled = open && filter !== 'pages' && debouncedQuery.length >= MIN_REMOTE_QUERY && recordFilters.length > 0

  const remote = useQuery({
    queryKey: ['global-search', getTenantHeader(), currentSession, debouncedQuery, remoteTypes?.join(',') ?? 'all'],
    queryFn: ({ signal }) =>
      searchService.globalSearch(debouncedQuery, { types: remoteTypes, limit: remoteTypes ? 10 : 5, signal }),
    enabled: remoteEnabled,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    placeholderData: keepPreviousData,
    retry: false,
  })

  const isTyping = trimmed.length > 0
  const remotePending = remoteEnabled && (trimmed !== debouncedQuery || remote.isFetching)

  const sections = useMemo<Section[]>(() => {
    if (!isTyping) {
      const result: Section[] = []
      if (memory.recentSearches.length) {
        result.push({
          id: 'recent-searches',
          label: 'Recent searches',
          rows: memory.recentSearches.map((value) => ({
            key: `rs:${value}`,
            kind: 'recent-search',
            title: value,
            query: value,
            icon: Clock,
          })),
          action: {
            label: 'Clear history',
            onClick: () => setMemory(clearHistory(storageKey)),
          },
        })
      }
      if (memory.recentItems.length) {
        result.push({ id: 'recent-items', label: 'Recently opened', rows: memory.recentItems.map(storedToRow) })
      }
      const recentPaths = new Set(memory.recentItems.map((item) => item.path))
      const frequent = topVisitedPaths(memory, 10)
        .map((path) => pageByPath.get(path))
        .filter((page): page is LocalEntry => Boolean(page) && !recentPaths.has(page!.path))
        .slice(0, 5)
      if (frequent.length) {
        result.push({
          id: 'frequent',
          label: 'Frequently used',
          rows: frequent.map((page) => ({ ...localToRow(page), key: `freq:${page.path}`, icon: page.icon ?? TrendingUp })),
        })
      }
      if (actions.length) {
        result.push({ id: 'actions', label: 'Quick actions', rows: actions.slice(0, 4).map((action) => localToRow(action)) })
      }
      return result
    }

    const result: Section[] = []
    let localBest = 0
    if (filter === 'all' || filter === 'pages') {
      const scored = entries
        .map((entry) => ({ entry, match: scoreSearchable(trimmed, entry) }))
        .filter((item): item is { entry: LocalEntry; match: NonNullable<typeof item.match> } => item.match !== null)
        .sort((a, b) => b.match.score - a.match.score)
        .slice(0, filter === 'pages' ? LOCAL_LIMIT_FILTERED : LOCAL_LIMIT)
      localBest = scored[0]?.match.score ?? 0
      if (scored.length) {
        result.push({
          id: 'local',
          label: 'Pages & actions',
          rows: scored.map(({ entry, match }) => localToRow(entry, match.titleRanges)),
        })
      }
    }

    if (filter !== 'pages' && trimmed.length >= MIN_REMOTE_QUERY) {
      const groups = remote.data?.groups ?? []
      // Nothing matched exactly, so the server returned the closest spellings instead.
      const isFuzzy = remote.data?.fuzzy === true
      const remoteSections: Section[] = groups.map((group) => ({
        id: `remote:${group.type}`,
        label: group.label,
        tag: isFuzzy ? 'Closest matches' : undefined,
        rows: group.items.map((hit) => ({
          key: `${hit.type}:${hit.id}`,
          kind: 'record',
          title: hit.title,
          subtitle: hit.subtitle,
          path: hit.path,
          badge: hit.badge,
          recordType: hit.type,
          icon: RECORD_ICONS[hit.type] ?? FileText,
          ranges: scoreSearchable(trimmed, { title: hit.title })?.titleRanges,
        })),
      }))
      // An exact record hit (e.g. a full admission number) outranks fuzzy page matches.
      const exactRecord = groups[0]?.items[0]?.score === 100
      if (exactRecord && localBest < 900) result.unshift(...remoteSections)
      else result.push(...remoteSections)

      if (!remote.data && remotePending) {
        result.push({ id: 'remote-loading', label: 'Records', rows: [], loading: true })
      }
    }
    return result
  }, [isTyping, memory, storageKey, pageByPath, actions, filter, entries, trimmed, remote.data, remotePending])

  const rows = useMemo(() => sections.flatMap((section) => section.rows), [sections])
  // Each row's position in `rows`, computed once — never counted during render, because
  // OverlayShell can call its render function more than once per palette render.
  const rowIndexByKey = useMemo(() => {
    const map = new Map<string, number>()
    sections.forEach((section) => section.rows.forEach((row) => map.set(`${section.id}:${row.key}`, map.size)))
    return map
  }, [sections])

  useEffect(() => {
    setActiveIndex(0)
  }, [trimmed, filter])

  useEffect(() => {
    if (activeIndex >= rows.length) setActiveIndex(Math.max(rows.length - 1, 0))
  }, [rows.length, activeIndex])

  // Keep the active row in view.
  useEffect(() => {
    const node = listRef.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)
    node?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  const selectRow = useCallback(
    (row: Row, options: { newTab?: boolean } = {}) => {
      if (row.kind === 'recent-search' && row.query) {
        setQuery(row.query)
        inputRef.current?.focus()
        return
      }
      if (!row.path) return

      if (trimmed.length >= MIN_REMOTE_QUERY) addRecentSearch(storageKey, trimmed)
      addRecentItem(storageKey, {
        id: row.key,
        kind: row.kind as StoredItem['kind'],
        type: row.recordType,
        title: row.title,
        subtitle: row.subtitle,
        path: row.path,
      })

      if (options.newTab) {
        window.open(`${window.location.pathname}${window.location.search}#${row.path}`, '_blank', 'noopener')
        return
      }
      onClose()
      if (row.run === 'switch-session') {
        clearSession()
      }
      navigate(row.path)
    },
    [trimmed, storageKey, onClose, clearSession, navigate]
  )

  const filters = useMemo<Array<{ id: Filter; label: string }>>(
    () => [
      { id: 'all', label: 'All' },
      { id: 'pages', label: 'Pages' },
      ...recordFilters.map((entry) => ({ id: entry.type, label: entry.label })),
    ],
    [recordFilters]
  )

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || (event.ctrlKey && event.key === 'n')) {
      event.preventDefault()
      if (rows.length) setActiveIndex((index) => (index + 1) % rows.length)
    } else if (event.key === 'ArrowUp' || (event.ctrlKey && event.key === 'p')) {
      event.preventDefault()
      if (rows.length) setActiveIndex((index) => (index - 1 + rows.length) % rows.length)
    } else if (event.key === 'PageDown') {
      event.preventDefault()
      setActiveIndex(Math.max(rows.length - 1, 0))
    } else if (event.key === 'PageUp') {
      event.preventDefault()
      setActiveIndex(0)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const row = rows[activeIndex]
      if (row) selectRow(row, { newTab: event.metaKey || event.ctrlKey })
    } else if (event.key === 'Tab') {
      // Tab cycles the filter chips; focus stays in the input.
      event.preventDefault()
      const index = filters.findIndex((entry) => entry.id === filter)
      const next = (index + (event.shiftKey ? -1 : 1) + filters.length) % filters.length
      setFilter(filters[next].id)
    } else if (event.key === 'Backspace' && !query && filter !== 'all') {
      setFilter('all')
    }
  }

  const activeRow = rows[activeIndex]
  const showEmpty = isTyping && rows.length === 0 && !remotePending
  const showFirstRun = !isTyping && rows.length === 0

  return (
    <OverlayShell open={open} onClose={onClose} variant="command">
      {(trapRef) => (
        <div ref={trapRef} className="cb-cmdk" role="dialog" aria-modal="true" aria-label="Search">
          <div className="cb-cmdk__inputrow">
            {remotePending ? (
              <Loader2 size={18} strokeWidth={1.75} className="cb-cmdk__inputicon cb-cmdk__spin" aria-hidden />
            ) : (
              <Search size={18} strokeWidth={1.75} className="cb-cmdk__inputicon" aria-hidden />
            )}
            <input
              ref={inputRef}
              className="cb-cmdk__input"
              type="text"
              role="combobox"
              aria-expanded="true"
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={activeRow ? `${baseId}-opt-${activeIndex}` : undefined}
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              placeholder={
                filter === 'all' || filter === 'pages'
                  ? 'Search pages, students, staff, receipts, assets…'
                  : `Search ${filters.find((entry) => entry.id === filter)?.label.toLowerCase()}…`
              }
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={onKeyDown}
            />
            {query ? (
              <button
                type="button"
                tabIndex={-1}
                className="cb-cmdk__clear"
                aria-label="Clear search"
                onClick={() => {
                  setQuery('')
                  inputRef.current?.focus()
                }}
              >
                <X size={16} strokeWidth={1.75} aria-hidden />
              </button>
            ) : null}
            <kbd className="cb-cmdk__kbd cb-cmdk__esc">esc</kbd>
          </div>

          {filters.length > 2 ? (
            <div className="cb-cmdk__chips" role="toolbar" aria-label="Filter results">
              {filters.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  tabIndex={-1}
                  className={`cb-cmdk__chip${filter === entry.id ? ' is-active' : ''}`}
                  aria-pressed={filter === entry.id}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => setFilter(entry.id)}
                >
                  {entry.label}
                </button>
              ))}
            </div>
          ) : null}

          <div ref={listRef} id={listId} className="cb-cmdk__list" role="listbox" aria-label="Search results">
            {sections.map((section) => (
              <div key={section.id} className="cb-cmdk__section" role="group" aria-label={section.label}>
                <div className="cb-cmdk__sectionhead">
                  <span className="cb-cmdk__sectionlabel">
                    {section.label}
                    {section.tag ? <span className="cb-cmdk__sectiontag">{section.tag}</span> : null}
                  </span>
                  {section.action ? (
                    <button
                      type="button"
                      tabIndex={-1}
                      className="cb-cmdk__sectionaction"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={section.action.onClick}
                    >
                      {section.action.label}
                    </button>
                  ) : null}
                </div>
                {section.loading
                  ? [0, 1].map((skeleton) => (
                      <div key={skeleton} className="cb-cmdk__skeleton" aria-hidden>
                        <span className="cb-cmdk__skeletonicon" />
                        <span className="cb-cmdk__skeletonline" />
                      </div>
                    ))
                  : section.rows.map((row) => {
                      const index = rowIndexByKey.get(`${section.id}:${row.key}`) ?? -1
                      const Icon = row.icon
                      const isActive = index === activeIndex
                      return (
                        <div
                          key={`${section.id}:${row.key}`}
                          id={`${baseId}-opt-${index}`}
                          data-index={index}
                          role="option"
                          aria-selected={isActive}
                          className={`cb-cmdk__row${isActive ? ' is-active' : ''}`}
                          onMouseMove={(event) => {
                            const last = pointerRef.current
                            if (last && last.x === event.clientX && last.y === event.clientY) return
                            pointerRef.current = { x: event.clientX, y: event.clientY }
                            if (!isActive) setActiveIndex(index)
                          }}
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={(event) => selectRow(row, { newTab: event.metaKey || event.ctrlKey })}
                        >
                          <span className="cb-cmdk__rowicon" aria-hidden>
                            {row.image ? <img src={row.image} alt="" /> : Icon ? <Icon size={16} strokeWidth={1.75} /> : null}
                          </span>
                          <span className="cb-cmdk__rowtext">
                            <span className="cb-cmdk__rowtitle">
                              <Highlight text={row.title} ranges={row.ranges} />
                            </span>
                            {row.subtitle ? <span className="cb-cmdk__rowsub">{row.subtitle}</span> : null}
                          </span>
                          {row.badge ? <span className="cb-cmdk__badge">{row.badge}</span> : null}
                          {row.kind === 'recent-search' ? (
                            <button
                              type="button"
                              tabIndex={-1}
                              className="cb-cmdk__rowremove"
                              aria-label={`Remove "${row.title}" from recent searches`}
                              onMouseDown={(event) => event.preventDefault()}
                              onClick={(event) => {
                                event.stopPropagation()
                                setMemory(removeRecentSearch(storageKey, row.title))
                              }}
                            >
                              <X size={14} strokeWidth={1.75} aria-hidden />
                            </button>
                          ) : row.hint ? (
                            <span className="cb-cmdk__hint">{row.hint}</span>
                          ) : null}
                          {isActive ? <CornerDownLeft size={14} strokeWidth={1.75} className="cb-cmdk__enter" aria-hidden /> : null}
                        </div>
                      )
                    })}
              </div>
            ))}

            {showEmpty ? (
              <div className="cb-cmdk__empty">
                <Search size={22} strokeWidth={1.5} aria-hidden />
                <p className="cb-cmdk__emptytitle">No results for “{trimmed}”</p>
                <p className="cb-cmdk__emptysub">
                  {remote.isError ? 'Records couldn’t be searched right now. Pages are still listed when they match.' : 'Try a name, admission number, receipt number or asset ID.'}
                </p>
              </div>
            ) : null}

            {showFirstRun ? (
              <div className="cb-cmdk__empty">
                <History size={22} strokeWidth={1.5} aria-hidden />
                <p className="cb-cmdk__emptytitle">Search everything in one place</p>
                <p className="cb-cmdk__emptysub">Pages you visit and searches you make will show up here.</p>
              </div>
            ) : null}
          </div>

          <div className="cb-cmdk__foot" aria-hidden>
            <span className="cb-cmdk__foothint">
              <kbd className="cb-cmdk__kbd"><ArrowUp size={11} /></kbd>
              <kbd className="cb-cmdk__kbd"><ArrowDown size={11} /></kbd>
              Navigate
            </span>
            <span className="cb-cmdk__foothint">
              <kbd className="cb-cmdk__kbd"><CornerDownLeft size={11} /></kbd>
              Open
            </span>
            <span className="cb-cmdk__foothint cb-cmdk__foothint--wide">
              <kbd className="cb-cmdk__kbd">{isMac ? '⌘' : 'Ctrl'}</kbd>
              <kbd className="cb-cmdk__kbd"><CornerDownLeft size={11} /></kbd>
              New tab
            </span>
            {filters.length > 2 ? (
              <span className="cb-cmdk__foothint cb-cmdk__foothint--wide">
                <kbd className="cb-cmdk__kbd">Tab</kbd>
                Filter
              </span>
            ) : null}
            {isTyping && remote.data && !remotePending ? (
              <span className="cb-cmdk__took">{remote.data.tookMs} ms</span>
            ) : null}
          </div>
        </div>
      )}
    </OverlayShell>
  )
}

export default CommandPalette
