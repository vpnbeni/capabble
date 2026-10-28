import { api } from '@/lib/api'

// The library desk (/api/libry), the website's Library → Circulation, Catalogue, Members and Fines.
// Copies are found by accession number or barcode, typed until the camera can scan them.

export interface LibraryMember {
  _id: string
  name: string
  memberType: string
  memberId: string
  className?: string
  section?: string
  status: string
}

export interface LibraryCopy {
  _id: string
  accessionNumber: string
  barcode?: string
  status: 'available' | 'issued' | 'lost' | 'damaged' | 'inspection' | string
  shelfLocation?: string
  titleId?: { _id: string; title: string; authors?: string[] } | null
}

export interface Loan {
  _id: string
  dueAt: string
  issuedAt?: string
  renewals: number
  status: 'active' | 'returned'
  copyId?: LibraryCopy | null
  memberId?: LibraryMember | null
}

export interface LibraryTitle {
  _id: string
  title: string
  authors?: string[]
  /** Copies of this title, and how many are on the shelf. */
  inventory?: { copies: number; available: number }
  classificationCode?: string
}

export interface Fine {
  _id: string
  amount: number
  outstandingAmount: number
  status: 'open' | 'paid' | 'waived' | string
  kind?: string
  reason?: string
  memberId?: { name: string; memberType: string } | null
  createdAt: string
}

export interface LibraryToday {
  titles: number
  copies: number
  available: number
  issued: number
  overdue: number
  dueToday: number
  todayIssues: number
  todayReturns: number
}

export const libraryService = {
  today: () => api.get<LibraryToday>('/libry/dashboard'),
  loans: () => api.get<{ items: Loan[] }>('/libry/loans'),
  member: (code: string) => api.get<{ member: LibraryMember; activeLoans: number; policy: { maxActiveLoans: number; loanDays: number } | null; eligible: boolean }>('/libry/members/lookup', { code }),
  members: (q: string) => api.get<{ items: LibraryMember[] }>('/libry/members', { q: q || undefined }),
  copy: (code: string) => api.get<LibraryCopy>('/libry/copies/lookup', { code }),
  issue: (memberId: string, copyId: string) => api.post<Loan>('/libry/loans/issue', { memberId, copyId }),
  /** By accession number or barcode; "damaged" or "requires_inspection" takes the copy off the shelf. */
  returnByCode: (code: string, condition: 'good' | 'damaged' | 'requires_inspection') => api.post<Loan>('/libry/loans/return-scan', { code, condition }),
  renew: (loanId: string) => api.post<Loan>(`/libry/loans/${encodeURIComponent(loanId)}/renew`, {}),
  titles: (q: string) => api.get<{ items: LibraryTitle[] }>('/libry/titles', { q: q || undefined, limit: 40 }),
  fines: () => api.get<{ items: Fine[] }>('/libry/fines'),
  waiveFine: (id: string, reason: string) => api.post<Fine>(`/libry/fines/${encodeURIComponent(id)}/waive`, { reason }),
}
