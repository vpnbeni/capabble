import api from './api'

export type LibraryTitle = { _id: string; title: string; subtitle?: string; authors: string[]; isbn13?: string; publisher?: string; language?: string; subjects: string[]; classificationCode?: string; resourceType: 'physical' | 'digital'; inventory?: { copies: number; available: number } }
export type LibraryCopy = { _id: string; accessionNumber: string; barcode?: string; shelfLocation?: string; condition: string; status: string; titleId?: Pick<LibraryTitle, '_id' | 'title' | 'authors' | 'isbn13'> }
export type LibraryMember = { _id: string; memberType: string; memberId: string; name: string; className?: string; section?: string; status: string }
export type LibraryLoan = { _id: string; dueAt: string; renewals: number; copyId?: LibraryCopy; memberId?: LibraryMember }

const libryService = {
  dashboard: async () => (await api.get('/libry/dashboard')).data.data,
  listTitles: async (params?: Record<string, unknown>) => (await api.get('/libry/titles', { params })).data.data as { items: LibraryTitle[]; pagination: { total: number } },
  lookupTitle: async (code: string) => (await api.get('/libry/titles/lookup', { params: { code } })).data.data as LibraryTitle,
  createTitle: async (payload: Record<string, unknown>) => (await api.post('/libry/titles', payload)).data.data,
  listCopies: async (params?: Record<string, unknown>) => (await api.get('/libry/copies', { params })).data.data as { items: LibraryCopy[]; pagination: { total: number } },
  createCopy: async (payload: Record<string, unknown>) => (await api.post('/libry/copies', payload)).data.data,
  lookupCopy: async (code: string) => (await api.get('/libry/copies/lookup', { params: { code } })).data.data as LibraryCopy,
  bulkCreateCopies: async (payload: Record<string, unknown>) => (await api.post('/libry/copies/bulk', payload)).data.data,
  listMembers: async (params?: Record<string, unknown>) => (await api.get('/libry/members', { params })).data.data as { items: LibraryMember[] },
  saveMember: async (payload: Record<string, unknown>) => (await api.post('/libry/members', payload)).data.data,
  lookupMember: async (code: string) => (await api.get('/libry/members/lookup', { params: { code } })).data.data as { member: LibraryMember; activeLoans: number; policy: { maxActiveLoans: number; loanDays: number } | null; eligible: boolean },
  listPolicies: async () => (await api.get('/libry/policies')).data.data,
  savePolicy: async (payload: Record<string, unknown>) => (await api.put('/libry/policies', payload)).data.data,
  listLoans: async () => (await api.get('/libry/loans')).data.data as { items: LibraryLoan[] },
  issue: async (payload: { memberId: string; copyId: string }) => (await api.post('/libry/loans/issue', payload)).data.data,
  returnLoan: async (id: string) => (await api.post(`/libry/loans/${id}/return`)).data.data,
  returnByBarcode: async (code: string, condition: 'good' | 'damaged' | 'requires_inspection') => (await api.post('/libry/loans/return-scan', { code, condition })).data.data,
  renewLoan: async (id: string) => (await api.post(`/libry/loans/${id}/renew`)).data.data,
  listReservations: async () => (await api.get('/libry/reservations')).data.data,
  reserve: async (payload: { memberId: string; titleId: string }) => (await api.post('/libry/reservations', payload)).data.data,
  listFines: async () => (await api.get('/libry/fines')).data.data as { items: any[] },
  assessFine: async (payload: Record<string, unknown>) => (await api.post('/libry/fines', payload)).data.data,
  waiveFine: async (id: string, reason: string) => (await api.post(`/libry/fines/${id}/waive`, { reason })).data.data,
  listAcquisitions: async () => (await api.get('/libry/acquisitions')).data.data as { items: any[] },
  requestAcquisition: async (payload: Record<string, unknown>) => (await api.post('/libry/acquisitions', payload)).data.data,
  reviewAcquisition: async (id: string, decision: 'approved' | 'rejected', note = '') => (await api.post(`/libry/acquisitions/${id}/review`, { decision, note })).data.data,
  report: async (type: 'inventory' | 'overdue' | 'fines') => (await api.get(`/libry/reports/${type}`)).data.data,
  listStocktakes: async () => (await api.get('/libry/stocktakes')).data.data as { items: any[] },
  startStocktake: async (name: string) => (await api.post('/libry/stocktakes', { name })).data.data,
  scanStocktake: async (id: string, code: string) => (await api.post(`/libry/stocktakes/${id}/scan`, { code })).data.data,
  closeStocktake: async (id: string) => (await api.post(`/libry/stocktakes/${id}/close`)).data.data,
  audit: async () => (await api.get('/libry/audit')).data.data as { items: any[] },
  listDigitalResources: async () => (await api.get('/libry/digital-resources')).data.data as { items: any[] },
  createDigitalResource: async (payload: Record<string, unknown>) => (await api.post('/libry/digital-resources', payload)).data.data,
  listReadingLists: async () => (await api.get('/libry/reading-lists')).data.data as { items: any[] },
  createReadingList: async (payload: Record<string, unknown>) => (await api.post('/libry/reading-lists', payload)).data.data,
  listChallenges: async () => (await api.get('/libry/challenges')).data.data as { items: any[] },
  createChallenge: async (payload: Record<string, unknown>) => (await api.post('/libry/challenges', payload)).data.data,
}

export default libryService
