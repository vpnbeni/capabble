import api from './api'

export interface Form66Record {
  _id: string
  rollNo: string
  examDate: string
  subjectCode: string
  subject: string
  class: string
  centreNo?: string
  centreName?: string
}

export type Form66Class = '10th' | '12th'

export interface Form66UploadResponse {
  message: string
  count: number
  dateCount?: number
  dates?: string[]
  originalFileUrl?: string
  processedPdfUrl?: string
  uploadId?: string
  uploadedClasses?: string[]
}

const getRecords = async (): Promise<Form66Record[]> => {
  const response = await api.get('/form66/records')
  const body = response.data
  return Array.isArray(body) ? body : []
}

// A class with no uploaded file answers 404: that's "no file yet", not an error to toast.
const getFileUrl = async (path: string, classValue: Form66Class): Promise<string | null> => {
  try {
    const response = await api.get(path, { params: { class: classValue }, _silent: true } as any)
    return response?.data?.url || null
  } catch (error: any) {
    if (error?.response?.status === 404) return null
    throw error
  }
}

const getProcessedPdfUrl = (classValue: Form66Class) => getFileUrl('/form66/processed-pdf', classValue)

const getOriginalFileUrl = (classValue: Form66Class) => getFileUrl('/form66/original-file', classValue)

const upload = async (file: File): Promise<Form66UploadResponse> => {
  const formData = new FormData()
  formData.append('file', file)
  const response = await api.post('/form66/upload', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  })
  return response.data
}

const getDatePdf = async (date: string, subjectCode?: string): Promise<Blob> => {
  const path = subjectCode
    ? `/form66/dates/${date}/subjects/${subjectCode}/pdf`
    : `/form66/dates/${date}/pdf`
  const response = await api.get(path, {
    responseType: 'blob',
  })
  return response.data
}

const fetchRemoteBlob = async (sourceUrl: string): Promise<Blob> => {
  const response = await fetch(sourceUrl)
  if (!response.ok) {
    throw new Error(`Unable to load file (${response.status})`)
  }
  return response.blob()
}

const fetchRemoteText = async (sourceUrl: string): Promise<string> => {
  const response = await fetch(sourceUrl)
  if (!response.ok) {
    throw new Error(`Unable to load text (${response.status})`)
  }
  return response.text()
}

const form66Service = {
  getRecords,
  getProcessedPdfUrl,
  getOriginalFileUrl,
  upload,
  getDatePdf,
  fetchRemoteBlob,
  fetchRemoteText,
}

export default form66Service
