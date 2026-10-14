import api from './api'
import type { BulkResult } from '@/components/ui'
import type { PaymentMode } from './cpitlService'

/**
 * CPITL bulk actions. Each endpoint runs the same server logic as its single-record
 * action, one record at a time, and reports what happened to every id: records that
 * fail are skipped with a reason and the rest still go through. Max 200 ids per call.
 */

type BulkResponse = BulkResult & { done: Array<{ id: string; label?: string }> }

/** Bulk endpoints answer 422 when every record was skipped; that is still a result to show. */
const postBulk = async (url: string, body: Record<string, unknown>): Promise<BulkResponse> => {
  try {
    return (await api.post(url, body)).data.data as BulkResponse
  } catch (error: any) {
    const data = error?.response?.status === 422 ? error.response.data?.data : null
    if (data) return data as BulkResponse
    throw error
  }
}

/** POSTs ids and opens the returned PDF in a new tab (ids can be too many for a URL). */
const openPdfPost = async (url: string, body: Record<string, unknown>, filename: string) => {
  const res = await api.post(url, body, { responseType: 'blob' })
  const blobUrl = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }))
  const win = window.open(blobUrl, '_blank')
  if (!win) {
    const link = document.createElement('a')
    link.href = blobUrl
    link.download = filename
    document.body.appendChild(link)
    link.click()
    link.remove()
  }
  window.setTimeout(() => window.URL.revokeObjectURL(blobUrl), 60_000)
}

const cpitlBulkService = {
  // ── Income ──────────────────────────────────────────────────────────
  /** Cancels receipts with one shared reason (needs the cancel-receipt permission). */
  cancelReceipts: (ids: string[], reason: string) => postBulk('/cpitl/payments/bulk-cancel', { ids, reason }),
  /** One PDF with a receipt per selected payment. */
  printReceipts: (ids: string[]) => openPdfPost('/cpitl/payments/receipts.pdf', { ids }, 'receipts.pdf'),
  /** One PDF with a fee slip per selected student (dues up to `upto`, YYYY-MM, optional). */
  printStudentSlips: (studentIds: string[], upto?: string) =>
    openPdfPost('/cpitl/fee-slips/students.pdf', { studentIds, upto }, 'fee-slips.pdf'),
  /** Waives (or, with waive=false, restores) instalments. */
  waiveDemands: (ids: string[], waive = true) => postBulk('/cpitl/demands/bulk-waive', { ids, waive }),
  archiveStructures: (ids: string[]) => postBulk('/cpitl/fee-structures/bulk-archive', { ids }),
  restoreStructures: (ids: string[]) => postBulk('/cpitl/fee-structures/bulk-restore', { ids }),

  // ── Expenses ────────────────────────────────────────────────────────
  voidExpenses: (ids: string[], reason: string) => postBulk('/cpitl/expenses/bulk-void', { ids, reason }),
  removeFuelLogs: (ids: string[], reason: string) => postBulk('/cpitl/fuel-logs/bulk-remove', { ids, reason }),
  payBills: (ids: string[], payment: { date: string; mode: PaymentMode; reference?: string }) =>
    postBulk('/cpitl/electricity/bills/bulk-pay', { ids, ...payment }),
  removeBills: (ids: string[], reason: string) => postBulk('/cpitl/electricity/bills/bulk-remove', { ids, reason }),

  // ── Payroll ─────────────────────────────────────────────────────────
  /**
   * Revises salaries for selected staff: a % or fixed ₹ change to the monthly gross,
   * effective from a date. With preview=true nothing is saved; the response lists
   * before/after for each person.
   */
  reviseSalaries: (body: {
    teacherIds: string[]
    mode: 'percent' | 'amount'
    value: number
    effectiveFrom: string
    note?: string
    preview?: boolean
  }) => api.post('/cpitl/salary/staff/bulk-revise', body).then((r) => r.data.data as SalaryRevisionResult),
  /** Payslips for selected staff only, as one PDF. */
  printPayslips: (month: string, teacherIds: string[]) =>
    openPdfPost(`/cpitl/payroll/runs/${month}/payslips.pdf`, { teacherIds }, `payslips_${month}.pdf`),
}

export type SalaryRevisionResult = BulkResponse & {
  preview: boolean
  rows: Array<{ teacherId: string; name: string; beforeGross: number; afterGross: number; beforeNet?: number; afterNet?: number; error?: string }>
}

export default cpitlBulkService
