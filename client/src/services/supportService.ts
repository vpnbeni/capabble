import api from './api'

export interface SupportTicketPayload {
  productModule: string
  productModuleLabel: string
  pageOrArea: string
  pagePath?: string
  schoolCode?: string
  affiliationNo?: string
  issueDate?: string
  description: string
  screenshot?: string
}

export interface FeedbackPayload {
  name: string
  email: string
  rating: number
  message: string
}

const submitTicket = async (payload: SupportTicketPayload) => {
  const response = await api.post('/support/ticket', payload)
  return response.data
}

const submitFeedback = async (payload: FeedbackPayload) => {
  const response = await api.post('/support/feedback', payload)
  return response.data
}

export interface SystemStatusResponse {
  status: 'operational' | 'maintenance' | 'down'
  message: string
  updatedAt?: string
}

const getSystemStatus = async (): Promise<SystemStatusResponse> => {
  const response = await api.get('/support/status')
  const payload = response.data?.data || response.data
  return {
    status: payload?.status || 'operational',
    message: payload?.message || 'All systems operational',
    updatedAt: new Date().toISOString(),
  }
}

const supportService = {
  submitTicket,
  submitFeedback,
  getSystemStatus,
}

export default supportService
