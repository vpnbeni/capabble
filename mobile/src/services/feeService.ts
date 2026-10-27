import { api, requestBytes } from '@/lib/api'

// The fee counter (/api/cpitl), the same records as the website's Finance → Fee collection.
// Amounts are rupees (two decimals), as the finance module stores them.

export type PaymentMode = 'cash' | 'upi' | 'cheque' | 'dd' | 'bank_transfer' | 'card' | 'online'

// Same words as the website (client/src/components/cpitl/CpitlUi.tsx).
export const MODE_LABELS: Record<PaymentMode, string> = {
  cash: 'Cash',
  upi: 'UPI',
  cheque: 'Cheque',
  dd: 'Demand Draft',
  bank_transfer: 'Bank Transfer',
  card: 'Card',
  online: 'Online',
}

export interface FeeStudent {
  _id: string
  name: string
  rollNumber: string
  class: string
  section: string
  fatherName?: string
  guardianPhone?: string
  accountId: string | null
  totals: { total: number; paid: number; balance: number } | null
  /** Unpaid and due by the end of this month. */
  dueNow: number
}

export interface FeeDemand {
  _id: string
  label: string
  periodKey: string
  dueDate: string
  total: number
  paid: number
  balance: number
  status: 'due' | 'partial' | 'paid' | 'waived'
  lateFeeDue: number
  isOverdue: boolean
}

export interface FeePayment {
  _id: string
  receiptNo: string
  date: string
  mode: PaymentMode
  reference?: string
  cheque?: { number?: string; bank?: string; date?: string | null; status?: '' | 'pending' | 'cleared' | 'bounced' }
  feeAmount: number
  lateFeeCollected: number
  total: number
  status: 'valid' | 'cancelled'
  cancelReason?: string
  remarks?: string
  studentSnapshot?: { name?: string; rollNumber?: string; class?: string; section?: string }
  student?: string
}

export interface FeeAccount {
  student: { _id: string; name: string; rollNumber: string; class: string; section: string; fatherName?: string; guardianPhone?: string }
  account: { _id: string; totals: { total: number; paid: number; balance: number } } | null
  structure: { name: string; isOutdated: boolean } | null
  demands: FeeDemand[]
  payments: FeePayment[]
}

export interface PaymentInput {
  amount: number
  lateFee?: number
  mode: PaymentMode
  date: string
  reference?: string
  cheque?: { number: string; bank: string; date?: string }
  remarks?: string
}

const student = (id: string) => `/cpitl/students/${encodeURIComponent(id)}`

export const feeService = {
  /** Students with what they owe now; `q` matches name, admission no., father or guardian's phone. */
  students: (params: { q?: string; class?: string; section?: string; limit?: number }) => api.get<FeeStudent[]>('/cpitl/students', { limit: 50, ...params }),
  account: (id: string) => api.get<FeeAccount>(`${student(id)}/account`),
  /** Allocated to the oldest dues first, as at the counter on the website; makes the receipt. */
  pay: (id: string, input: PaymentInput) => api.post<FeePayment>(`${student(id)}/payments`, input),
  payments: async (params: { from?: string; to?: string; mode?: string; q?: string; limit?: number }) =>
    api.get<{ data: FeePayment[]; summary: { count: number; total: number } }>('/cpitl/payments', { limit: 200, ...params }, { raw: true }),
  receiptPdf: (paymentId: string) => requestBytes(`/cpitl/payments/${encodeURIComponent(paymentId)}/receipt.pdf`),
  cancel: (paymentId: string, reason: string) => api.post<FeePayment>(`/cpitl/payments/${encodeURIComponent(paymentId)}/cancel`, { reason }),
  /** A bounced cheque cancels its receipt and puts the dues back. */
  chequeStatus: (paymentId: string, status: 'cleared' | 'bounced', note?: string) =>
    api.post<FeePayment>(`/cpitl/payments/${encodeURIComponent(paymentId)}/cheque-status`, { status, note }),
}
