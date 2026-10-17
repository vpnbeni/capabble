import type { ReactNode } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Inbox } from './icons'

export interface DataTableColumn<T> {
  header: string
  accessor: keyof T | ((row: T) => ReactNode)
  className?: string
}

interface DataTableProps<T> {
  columns: DataTableColumn<T>[]
  data: T[]
  emptyMessage: string
  onRowClick?: (row: T) => void
  rowKey?: (row: T, index: number) => string
  pageSize?: number
}

export function DataTable<T>({
  columns,
  data,
  emptyMessage,
  onRowClick,
  rowKey,
  pageSize,
}: DataTableProps<T>) {
  const [page, setPage] = useState(1)

  const paginatedData = useMemo(() => {
    if (!pageSize || pageSize <= 0) return data

    const start = (page - 1) * pageSize
    return data.slice(start, start + pageSize)
  }, [data, page, pageSize])

  const totalPages = useMemo(() => {
    if (!pageSize || pageSize <= 0) return 1
    return Math.max(1, Math.ceil(data.length / pageSize))
  }, [data.length, pageSize])

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages)
    }
  }, [page, totalPages])

  return (
    <div className="cb-table-wrap admin-table">
      <div className="cb-table-scroll">
        <table className={`cb-table${onRowClick ? ' is-clickable' : ''}`}>
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.header} className={column.className} scope="col">
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paginatedData.map((row, index) => {
              const key = rowKey ? rowKey(row, index) : String(index)

              return (
                <tr key={key} onClick={() => onRowClick?.(row)}>
                  {columns.map((column) => {
                    const value = typeof column.accessor === 'function'
                      ? column.accessor(row)
                      : ((row as Record<string, unknown>)[column.accessor as string] as ReactNode)

                    return (
                      <td key={column.header} className={column.className}>
                        {value ?? '—'}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {data.length === 0 && (
        <div className="cb-empty cb-empty--compact">
          <span className="cb-empty__icon"><Inbox /></span>
          <p className="cb-empty__body">{emptyMessage}</p>
        </div>
      )}

      {pageSize && totalPages > 1 && (
        <div className="cb-table-foot">
          <span>
            Page {page} of {totalPages} · {data.length} rows
          </span>
          <div className="admin-table__pager">
            <button type="button" className="icon-button" aria-label="Previous page" disabled={page <= 1} onClick={() => setPage((prev) => prev - 1)}>
              <ChevronLeft />
            </button>
            <button type="button" className="icon-button" aria-label="Next page" disabled={page >= totalPages} onClick={() => setPage((prev) => prev + 1)}>
              <ChevronRight />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
