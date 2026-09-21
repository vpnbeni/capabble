import api from './api'

export interface SchoolProfile {
  name: string
  schoolCode: string
  affiliationNo: string
  affiliationTill: string
  logoUrl: string
  logoPublicId: string
  tagline: string
  address: string
  contact: string
  email: string
  metadata?: {
    studentRollNumberAssignment?: {
      mode?: string
      sortBy?: string
      scope?: string
      description?: string
    }
  }
}

type SchoolProfileUpdatePayload = Pick<
  SchoolProfile,
  'name' | 'schoolCode' | 'affiliationNo' | 'affiliationTill' | 'tagline' | 'address' | 'contact' | 'email'
>

const getProfile = async (): Promise<SchoolProfile> => {
  const response = await api.get('/school-profile')
  return (response?.data?.data || {}) as SchoolProfile
}

const updateProfile = async (payload: SchoolProfileUpdatePayload): Promise<SchoolProfile> => {
  const response = await api.put('/school-profile', {
    schoolName: payload.name,
    schoolCode: payload.schoolCode,
    affiliationNo: payload.affiliationNo,
    affiliationTill: payload.affiliationTill || '',
    tagline: payload.tagline,
    address: payload.address,
    contact: payload.contact,
    email: payload.email,
  })
  return (response?.data?.data || {}) as SchoolProfile
}

const uploadLogo = async (file: File): Promise<SchoolProfile> => {
  const formData = new FormData()
  formData.append('logo', file)

  const response = await api.post('/school-profile/logo', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })

  return (response?.data?.data || {}) as SchoolProfile
}

const schoolProfileService = {
  getProfile,
  updateProfile,
  uploadLogo,
}

export default schoolProfileService
