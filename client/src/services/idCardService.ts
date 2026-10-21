import api from './api'
import type { FormatCanvasItem } from '@/components/format-editor'

export type IdCardFields = {
  photo: boolean
  admissionNo: boolean
  classSection: boolean
  rollNo: boolean
  dob: boolean
  bloodGroup: boolean
  fatherName: boolean
  motherName: boolean
  guardianPhone: boolean
  address: boolean
  bus: boolean
  qr: boolean
}

export type IdCardDesign = {
  title: string
  orientation: 'portrait' | 'landscape'
  layout: 'sheet' | 'single'
  accentColor: string
  validity: string
  showSchoolLogo: boolean
  showSchoolAddress: boolean
  showBack: boolean
  backText: string
  emergencyContact: string
  fields: IdCardFields
  signatures: { principal: boolean; principalSignatureUrl: string; principalSignaturePublicId?: string }
  canvasItems: FormatCanvasItem[]
}

export type IdCardClassRow = { className: string; section: string; students: number; issued: number }

export const DEFAULT_ID_CARD_DESIGN: IdCardDesign = {
  title: 'STUDENT IDENTITY CARD',
  orientation: 'portrait',
  layout: 'sheet',
  accentColor: '#1e3a8a',
  validity: '',
  showSchoolLogo: true,
  showSchoolAddress: true,
  showBack: true,
  backText: [
    'This card is the property of the school and must be carried every day.',
    'If found, please return it to the school office.',
    'Show this card to the bus staff when boarding and leaving the school bus.',
  ].join('\n'),
  emergencyContact: '',
  fields: {
    photo: true,
    admissionNo: true,
    classSection: true,
    rollNo: false,
    dob: true,
    bloodGroup: true,
    fatherName: true,
    motherName: false,
    guardianPhone: true,
    address: true,
    bus: true,
    qr: true,
  },
  signatures: { principal: true, principalSignatureUrl: '' },
  canvasItems: [],
}

const merge = (data: Partial<IdCardDesign> = {}): IdCardDesign => ({
  ...DEFAULT_ID_CARD_DESIGN,
  ...data,
  fields: { ...DEFAULT_ID_CARD_DESIGN.fields, ...(data.fields || {}) },
  signatures: { ...DEFAULT_ID_CARD_DESIGN.signatures, ...(data.signatures || {}) },
  canvasItems: Array.isArray(data.canvasItems) ? data.canvasItems : [],
})

const silent = { _silent: true } as any

const getDesign = async () => merge((await api.get('/id-cards/design', silent)).data.data)

const saveDesign = async (design: IdCardDesign) => merge((await api.put('/id-cards/design', { design }, silent)).data.data)

const uploadCanvasImage = async (file: File): Promise<{ url: string }> => {
  const formData = new FormData()
  formData.append('image', file)
  const response = await api.post('/id-cards/design/image', formData, { headers: { 'Content-Type': 'multipart/form-data' }, ...silent })
  return { url: String(response?.data?.data?.url || '') }
}

const uploadSignature = async (file: File) => {
  const formData = new FormData()
  formData.append('signature', file)
  const response = await api.post('/id-cards/design/signature', formData, { headers: { 'Content-Type': 'multipart/form-data' }, ...silent })
  return merge(response.data.data)
}

const getClasses = async () => (await api.get('/id-cards/classes', silent)).data.data as IdCardClassRow[]

/** Error bodies come back as a Blob when the request asked for a PDF. */
const blobError = async (error: any, fallback: string) => {
  const data = error?.response?.data
  if (data instanceof Blob) {
    try {
      const parsed = JSON.parse(await data.text())
      return new Error(parsed?.message || fallback)
    } catch {
      return new Error(fallback)
    }
  }
  return new Error(error?.response?.data?.message || error?.message || fallback)
}

/** Builds the PDF of ID cards and saves it. Returns how many new card codes were issued. */
const downloadCards = async (payload: { class?: string; section?: string; studentIds?: string[]; reissue?: boolean; design?: IdCardDesign }) => {
  try {
    const response = await api.post('/id-cards/generate', payload, { responseType: 'blob', ...silent })
    const blob = response.data as Blob
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `id-cards_${[payload.class, payload.section].filter(Boolean).join('-') || 'selected'}.pdf`.replace(/\s+/g, '_')
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000)
    return Number(response.headers?.['x-cards-issued'] || 0)
  } catch (error) {
    throw await blobError(error, 'Could not make the ID cards.')
  }
}

const idCardService = { getDesign, saveDesign, uploadCanvasImage, uploadSignature, getClasses, downloadCards }

export default idCardService
