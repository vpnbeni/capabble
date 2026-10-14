import React from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown, Inbox } from 'lucide-react'
import { cx } from './format'
import { Icon } from './primitives'
import { Checkbox } from './forms'
import { EmptyState } from './layout'

export interface DataTableColumn<R> {
  key: string
  header: React.ReactNode
  render?: (row: R) => React.ReactNode
  align?: 'right' | 'center'
  numeric?: boolean
  width?: number | string
  /** Phones: 'title' on top, 'subtitle' under it, 'aside' top-right, 'hidden' dropped. */
  mobile?: 'title' | 'subtitle' | 'aside' | 'hidden'
  sortable?: boolean
  /** Stops a click inside this cell from opening the row (inline controls). */
  interactive?: boolean
  /** Accessible label for the header when `header` is not plain text. */
  headerLabel?: string
  /** Lets long text in this cell wrap instead of widening the table (descriptions, excerpts). */
  wrap?: boolean
}

export interface DataTableSelection<R> {
  isSelected: (row: R) => boolean
  onToggle: (row: R) => void
  allSelected: boolean
  someSelected: boolean
  onToggleAll: () => void
  rowLabel: (row: R) => string
  /** Rows that can't take part in bulk actions show a disabled checkbox. */
  isDisabled?: (row: R) => boolean
}

export interface DataTableProps<R> {
  columns: DataTableColumn<R>[]
  rows: R[]
  getRowKey: (row: R) => string
  onRowClick?: (row: R) => void
  density?: 'compact' | 'comfortable'
  empty?: React.ReactNode
  loading?: boolean
  loadingLabel?: string
  footer?: React.ReactNode
  caption?: string
  sort?: { key: string; direction: 'asc' | 'desc' } | null
  onSort?: (key: string) => void
  selection?: DataTableSelection<R>
  /** Caps the table's height so the sticky header stays in view while rows scroll. */
  maxHeight?: string
  className?: string
}

const cellValue = <R,>(column: DataTableColumn<R>, row: R): React.ReactNode =>
  column.render ? column.render(row) : ((row as Record<string, unknown>)[column.key] as React.ReactNode) ?? '—'

const stop = (event: React.SyntheticEvent) => event.stopPropagation()

/**
 * Compact Shopify-style record list. Rows are 40px with 13px text; whole rows open the
 * record. When the table is narrower than 600px it renders each row as a card.
 */
export function DataTable<R>({
  columns,
  rows,
  getRowKey,
  onRowClick,
  density = 'compact',
  empty,
  loading,
  loadingLabel = 'Loading',
  footer,
  caption,
  sort,
  onSort,
  selection,
  maxHeight,
  className,
}: DataTableProps<R>) {
  const clickable = Boolean(onRowClick)

  let body: React.ReactNode
  if (loading && rows.length === 0) {
    body = (
      <div className="cb-table-state" role="status">
        <span className="cb-spinner" aria-hidden="true" />
        {loadingLabel}
      </div>
    )
  } else if (rows.length === 0) {
    body = empty || <EmptyState icon={Inbox} title="Nothing here yet" compact />
  } else {
    const titleCol = columns.find((c) => c.mobile === 'title') || columns[0]
    const subCol = columns.find((c) => c.mobile === 'subtitle')
    const asideCol = columns.find((c) => c.mobile === 'aside')
    // Header-less columns (a row's "…" menu) sit at the card's top-right, not as a labelled field.
    const actionCols = columns.filter(
      (c) => c !== titleCol && c !== subCol && c !== asideCol && c.mobile !== 'hidden' && c.header === ''
    )
    const fieldCols = columns.filter(
      (c) => c !== titleCol && c !== subCol && c !== asideCol && c.mobile !== 'hidden' && c.header !== ''
    )

    const headerCell = (column: DataTableColumn<R>) => {
      const active = sort?.key === column.key
      const ariaSort = column.sortable ? (active ? (sort?.direction === 'asc' ? 'ascending' : 'descending') : 'none') : undefined
      return (
        <th
          key={column.key}
          scope="col"
          aria-sort={ariaSort}
          className={cx(column.align && `is-${column.align}`)}
          style={column.width ? { width: column.width } : undefined}
        >
          {column.sortable && onSort ? (
            <button
              type="button"
              className={cx('cb-th-sort', active && 'is-active')}
              onClick={() => onSort(column.key)}
              aria-label={column.headerLabel ? `Sort by ${column.headerLabel}` : undefined}
            >
              {column.header}
              <Icon icon={active ? (sort?.direction === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown} size={14} />
            </button>
          ) : (
            column.header
          )}
        </th>
      )
    }

    body = (
      <>
        <div className="cb-table-scroll" style={maxHeight ? { maxHeight } : undefined}>
          <table className={cx('cb-table', `cb-table--${density}`, clickable && 'is-clickable')}>
            {caption ? <caption className="cb-visually-hidden">{caption}</caption> : null}
            <thead>
              <tr>
                {selection ? (
                  <th scope="col" className="cb-table__select">
                    <Checkbox
                      checked={selection.allSelected}
                      indeterminate={!selection.allSelected && selection.someSelected}
                      onChange={() => selection.onToggleAll()}
                      aria-label="Select all rows on this page"
                    />
                  </th>
                ) : null}
                {columns.map(headerCell)}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={getRowKey(row)}
                  className={selection?.isSelected(row) ? 'is-selected' : undefined}
                  onClick={clickable ? () => onRowClick?.(row) : undefined}
                  tabIndex={clickable ? 0 : undefined}
                  onKeyDown={
                    clickable
                      ? (event) => {
                          if (event.key === 'Enter' && event.target === event.currentTarget) onRowClick?.(row)
                        }
                      : undefined
                  }
                >
                  {selection ? (
                    <td className="cb-table__select" onClick={stop} onKeyDown={stop}>
                      <Checkbox
                        checked={selection.isSelected(row)}
                        onChange={() => selection.onToggle(row)}
                        disabled={selection.isDisabled?.(row)}
                        aria-label={selection.rowLabel(row)}
                      />
                    </td>
                  ) : null}
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      className={cx(column.align && `is-${column.align}`, column.numeric && 'is-num', column.wrap && 'is-wrap')}
                      onClick={column.interactive ? stop : undefined}
                      onKeyDown={column.interactive ? stop : undefined}
                    >
                      {cellValue(column, row)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <ul className="cb-table-cards" aria-label={caption}>
          {rows.map((row) => (
            <li
              key={getRowKey(row)}
              className={cx('cb-tcard', clickable && 'is-clickable', selection?.isSelected(row) && 'is-selected')}
              onClick={clickable ? () => onRowClick?.(row) : undefined}
              onKeyDown={
                clickable
                  ? (event) => {
                      if (event.key === 'Enter' && event.target === event.currentTarget) onRowClick?.(row)
                    }
                  : undefined
              }
              tabIndex={clickable ? 0 : undefined}
            >
              <div className="cb-tcard__head">
                {selection ? (
                  <span className="cb-tcard__select" onClick={stop} onKeyDown={stop}>
                    <Checkbox
                      checked={selection.isSelected(row)}
                      onChange={() => selection.onToggle(row)}
                        disabled={selection.isDisabled?.(row)}
                      aria-label={selection.rowLabel(row)}
                    />
                  </span>
                ) : null}
                <div className="cb-tcard__titles">
                  <div className="cb-tcard__title">{cellValue(titleCol, row)}</div>
                  {subCol ? <div className="cb-tcard__subtitle">{cellValue(subCol, row)}</div> : null}
                </div>
                {asideCol ? (
                  <div className="cb-tcard__aside" onClick={asideCol.interactive ? stop : undefined}>
                    {cellValue(asideCol, row)}
                  </div>
                ) : null}
                {actionCols.map((column) => (
                  <div key={column.key} className="cb-tcard__actions" onClick={stop} onKeyDown={stop}>
                    {cellValue(column, row)}
                  </div>
                ))}
              </div>
              {fieldCols.length ? (
                <dl className="cb-tcard__fields">
                  {fieldCols.map((column) => (
                    <div key={column.key} className="cb-tcard__field">
                      <dt>{column.headerLabel || column.header}</dt>
                      <dd
                        className={column.numeric ? 'is-num' : undefined}
                        onClick={column.interactive ? stop : undefined}
                      >
                        {cellValue(column, row)}
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : null}
            </li>
          ))}
        </ul>
      </>
    )
  }

  return (
    <div className={cx('cb-table-wrap', loading && rows.length > 0 && 'is-loading', className)} aria-busy={loading || undefined}>
      {body}
      {footer ? <div className="cb-table-foot">{footer}</div> : null}
    </div>
  )
}
