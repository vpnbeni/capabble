import React, { useEffect, useMemo, useState } from 'react'
import { CheckCircle2 } from 'lucide-react'
import type { DataTableSelection } from './DataTable'
import { Button, Icon } from './primitives'
import { Dialog } from './overlays'
import { Banner } from './layout'

/**
 * Row selection for a list or DataTable. Selection is kept by id, limited to the rows
 * currently shown, and cleared whenever `resetKey` changes (e.g. filters or the month),
 * so a bulk action never touches rows the user can no longer see.
 */
export const useRowSelection = <R,>(
  rows: R[],
  getId: (row: R) => string,
  options: { resetKey?: unknown; rowLabel?: (row: R) => string; isSelectable?: (row: R) => boolean } = {}
) => {
  const { resetKey, rowLabel, isSelectable } = options
  const [ids, setIds] = useState<Set<string>>(() => new Set())

  useEffect(() => {
    setIds(new Set())
  }, [resetKey])

  const selectable = useMemo(() => (isSelectable ? rows.filter(isSelectable) : rows), [rows, isSelectable])
  const visible = useMemo(() => new Set(selectable.map(getId)), [selectable, getId])

  // Drop ids that are no longer on screen (after a reload or a filter change).
  useEffect(() => {
    setIds((prev) => {
      const next = new Set([...prev].filter((id) => visible.has(id)))
      return next.size === prev.size ? prev : next
    })
  }, [visible])

  const selectedRows = useMemo(() => selectable.filter((row) => ids.has(getId(row))), [selectable, ids, getId])
  const count = selectedRows.length
  const allSelected = selectable.length > 0 && count === selectable.length

  const toggle = (row: R) =>
    setIds((prev) => {
      const next = new Set(prev)
      const id = getId(row)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const toggleAll = () => setIds(allSelected ? new Set() : new Set(selectable.map(getId)))
  const clear = () => setIds(new Set())

  const selection: DataTableSelection<R> = {
    isSelected: (row) => ids.has(getId(row)),
    onToggle: (row) => {
      if (!isSelectable || isSelectable(row)) toggle(row)
    },
    allSelected,
    someSelected: count > 0,
    onToggleAll: toggleAll,
    rowLabel: rowLabel || (() => 'Select row'),
    isDisabled: isSelectable ? (row) => !isSelectable(row) : undefined,
  }

  return { selection, selectedRows, selectedIds: selectedRows.map(getId), count, clear, toggle, toggleAll, allSelected }
}

/** Shown above a list while rows are selected: the count, the bulk actions and "Clear". */
export const BulkBar: React.FC<{
  count: number
  noun: string
  nounPlural?: string
  onClear: () => void
  busy?: boolean
  children: React.ReactNode
}> = ({ count, noun, nounPlural, onClear, busy, children }) => {
  if (count <= 0) return null
  return (
    <div className="cb-bulkbar" role="region" aria-label="Bulk actions">
      <span className="cb-bulkbar__count is-num" aria-live="polite">
        {count} {count === 1 ? noun : nounPlural || `${noun}s`} selected
      </span>
      <span className="cb-bulkbar__spacer" />
      <div className="cb-bulkbar__actions">{children}</div>
      <Button variant="tertiary" size="sm" onClick={onClear} disabled={busy}>
        Clear
      </Button>
    </div>
  )
}

export type BulkFailure = { id: string; label?: string; error: string }
export type BulkResult = { succeeded: number; failed: BulkFailure[] }

/** Outcome of a bulk action: how many went through, and each one skipped with its reason. */
export const BulkResultDialog: React.FC<{
  result: (BulkResult & { action: string; noun: string }) | null
  onClose: () => void
}> = ({ result, onClose }) => (
  <Dialog
    open={Boolean(result)}
    onClose={onClose}
    title={result ? `${result.action}: ${result.succeeded} done, ${result.failed.length} skipped` : ''}
    description={result?.succeeded ? `The other ${result.noun} went through.` : `None of the ${result?.noun} could be changed.`}
    footer={<Button variant="primary" onClick={onClose}>Done</Button>}
  >
    {result ? (
      <div className="cb-bulkresult">
        {result.succeeded > 0 ? (
          <p className="cb-bulkresult__ok">
            <Icon icon={CheckCircle2} size={16} /> {result.succeeded} {result.noun} updated.
          </p>
        ) : null}
        <Banner tone="warning" title="Skipped">
          <ul className="cb-bulkresult__list">
            {result.failed.map((f) => (
              <li key={f.id}>
                <strong>{f.label || f.id}</strong> — {f.error}
              </li>
            ))}
          </ul>
        </Banner>
      </div>
    ) : null}
  </Dialog>
)
