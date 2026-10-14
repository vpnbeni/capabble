import React, { useEffect, useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, LayoutDashboard, Search } from 'lucide-react'
import { Badge, Button, Checkbox, Sheet, Tabs, TextField } from '@/components/ui'
import type { LocalEntry } from '@/components/commandPalette/useLocalIndex'
import { DEFAULT_HOME_LAYOUT, MAX_PINNED, type HomeLayout, type WidgetId } from './homeLayout'
import { MAX_QUICK_ACTIONS, type QuickAction } from './quickActions'

export type CustomizeTab = 'widgets' | 'actions' | 'pins'
import { WIDGETS } from './HomeWidgets'

/** Choose, order and pin what Home shows. Changes apply when saved. */
export const HomeCustomize: React.FC<{
  open: boolean
  initialTab?: CustomizeTab
  layout: HomeLayout
  availableWidgets: WidgetId[]
  availableActions: QuickAction[]
  pages: LocalEntry[]
  onClose: () => void
  onSave: (layout: HomeLayout) => void
}> = ({ open, initialTab = 'widgets', layout, availableWidgets, availableActions, pages, onClose, onSave }) => {
  const [tab, setTab] = useState<CustomizeTab>(initialTab)
  const [draft, setDraft] = useState<HomeLayout>(layout)
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (!open) return
    setDraft(layout)
    setTab(initialTab)
    setQuery('')
  }, [open, layout, initialTab])

  // Shown widgets first, in their order, then the rest.
  const widgetRows = useMemo(() => {
    const shown = draft.widgets.filter((id) => availableWidgets.includes(id))
    const hidden = availableWidgets.filter((id) => !shown.includes(id))
    return [...shown.map((id) => ({ id, on: true })), ...hidden.map((id) => ({ id, on: false }))]
  }, [draft.widgets, availableWidgets])

  const toggleWidget = (id: WidgetId, on: boolean) =>
    setDraft((prev) => ({
      ...prev,
      widgets: on ? [...prev.widgets.filter((item) => item !== id), id] : prev.widgets.filter((item) => item !== id),
    }))

  const moveWidget = (id: WidgetId, step: -1 | 1) =>
    setDraft((prev) => {
      const list = prev.widgets.filter((item) => availableWidgets.includes(item))
      const index = list.indexOf(id)
      const target = index + step
      if (index < 0 || target < 0 || target >= list.length) return prev
      const next = [...list]
      ;[next[index], next[target]] = [next[target], next[index]]
      return { ...prev, widgets: next }
    })

  const filteredPages = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = q
      ? pages.filter((page) => `${page.title} ${page.subtitle || ''} ${page.keywords || ''}`.toLowerCase().includes(q))
      : pages
    return [...list].sort((a, b) => Number(draft.pinned.includes(b.path)) - Number(draft.pinned.includes(a.path)))
  }, [pages, query, draft.pinned])

  const togglePin = (path: string, on: boolean) =>
    setDraft((prev) => ({
      ...prev,
      pinned: on ? [...prev.pinned.filter((item) => item !== path), path].slice(0, MAX_PINNED) : prev.pinned.filter((item) => item !== path),
    }))

  const toggleAction = (id: string, on: boolean) =>
    setDraft((prev) => ({
      ...prev,
      actions: on ? [...prev.actions.filter((item) => item !== id), id].slice(0, MAX_QUICK_ACTIONS) : prev.actions.filter((item) => item !== id),
    }))
  const actionCount = draft.actions.filter((id) => availableActions.some((action) => action.id === id)).length
  const actionsFull = actionCount >= MAX_QUICK_ACTIONS

  const pinsFull = draft.pinned.length >= MAX_PINNED
  const shownCount = widgetRows.filter((row) => row.on).length

  return (
    <Sheet
      open={open}
      onClose={onClose}
      icon={LayoutDashboard}
      title="Customize Home"
      description="Pick what you want to see first. Saved for you on this device."
      size="md"
      footer={
        <>
          <Button variant="tertiary" onClick={() => setDraft(DEFAULT_HOME_LAYOUT)}>
            Restore defaults
          </Button>
          <span className="home-sheet__spacer" />
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={() => onSave(draft)}>
            Save layout
          </Button>
        </>
      }
    >
      <div className="home-sheet">
        <Tabs
          variant="segmented"
          label="Customize"
          value={tab}
          onChange={(id) => setTab(id as CustomizeTab)}
          items={[
            { id: 'widgets', label: 'Widgets', count: shownCount },
            { id: 'actions', label: 'Quick actions', count: actionCount },
            { id: 'pins', label: 'Pinned pages', count: draft.pinned.length },
          ]}
        />

        {tab === 'widgets' ? (
          <ul className="home-sheet__list">
            {widgetRows.map((row, index) => {
              const def = WIDGETS[row.id]
              return (
                <li key={row.id} className="home-sheet__row">
                  <Checkbox
                    label={def.title}
                    description={def.description}
                    checked={row.on}
                    onChange={(checked) => toggleWidget(row.id, checked)}
                  />
                  {row.on ? (
                    <span className="home-sheet__move">
                      <Button
                        variant="tertiary"
                        size="sm"
                        icon={ArrowUp}
                        aria-label={`Move ${def.title} up`}
                        disabled={index === 0}
                        onClick={() => moveWidget(row.id, -1)}
                      />
                      <Button
                        variant="tertiary"
                        size="sm"
                        icon={ArrowDown}
                        aria-label={`Move ${def.title} down`}
                        disabled={index === shownCount - 1}
                        onClick={() => moveWidget(row.id, 1)}
                      />
                    </span>
                  ) : null}
                </li>
              )
            })}
          </ul>
        ) : tab === 'actions' ? (
          <div className="home-sheet__pins">
            <p className="home-sheet__hint">
              {actionsFull ? (
                <Badge tone="warning">All {MAX_QUICK_ACTIONS} spots used</Badge>
              ) : (
                `${actionCount} of ${MAX_QUICK_ACTIONS} chosen. Only actions for your school's modules are listed.`
              )}
            </p>
            <ul className="home-sheet__list">
              {availableActions.map((action) => {
                const on = draft.actions.includes(action.id)
                return (
                  <li key={action.id} className="home-sheet__row">
                    <Checkbox
                      label={action.label}
                      checked={on}
                      disabled={!on && actionsFull}
                      onChange={(checked) => toggleAction(action.id, checked)}
                    />
                  </li>
                )
              })}
            </ul>
          </div>
        ) : (
          <div className="home-sheet__pins">
            <TextField
              size="sm"
              icon={Search}
              placeholder="Search pages"
              aria-label="Search pages"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <p className="home-sheet__hint">
              {pinsFull ? (
                <Badge tone="warning">All {MAX_PINNED} pins used</Badge>
              ) : (
                `${draft.pinned.length} of ${MAX_PINNED} pinned. Pinned pages show on Home in the order you pick them.`
              )}
            </p>
            <ul className="home-sheet__list">
              {filteredPages.map((page) => {
                const on = draft.pinned.includes(page.path)
                return (
                  <li key={page.path} className="home-sheet__row">
                    <Checkbox
                      label={page.title}
                      description={page.subtitle || undefined}
                      checked={on}
                      disabled={!on && pinsFull}
                      onChange={(checked) => togglePin(page.path, checked)}
                    />
                  </li>
                )
              })}
              {filteredPages.length === 0 ? <li className="home-sheet__empty">No pages match “{query}”.</li> : null}
            </ul>
          </div>
        )}
      </div>
    </Sheet>
  )
}
