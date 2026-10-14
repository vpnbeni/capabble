import axios, { AxiosInstance, AxiosResponse, InternalAxiosRequestConfig } from 'axios'
import toast from 'react-hot-toast'
import { getTenantHeader, isLocalRuntime, resolveApiBaseUrl } from '@/utils/tenantRuntime'
import { getAcademicSessionHeader } from '@/contexts/AcademicSessionContext'
import { clearAuthData, getAuthToken, getRefreshToken, setStoredToken } from '@/utils/authStorage'

// API configuration
const API_BASE_URL = resolveApiBaseUrl()

// Store reference for Redux dispatch
let storeDispatch: any = null

// Flag to show session-expired toast only once when multiple requests fail with 401
let sessionExpiredToastShown = false
const API_ERROR_TOAST_ID = 'api-error'
const API_SUCCESS_TOAST_ID = 'api-success'
const API_ERROR_DEDUP_WINDOW_MS = 2000
const API_SUCCESS_DEDUP_WINDOW_MS = 2000
let lastApiErrorToast = {
  message: '',
  shownAt: 0,
}
let lastApiSuccessToast = {
  message: '',
  shownAt: 0,
}

const showApiSuccessToast = (message: string) => {
  const normalizedMessage = message?.trim()
  if (!normalizedMessage) return

  const now = Date.now()
  const isDuplicateWithinWindow =
    lastApiSuccessToast.message === normalizedMessage &&
    now - lastApiSuccessToast.shownAt < API_SUCCESS_DEDUP_WINDOW_MS

  if (isDuplicateWithinWindow) return

  lastApiSuccessToast = { message: normalizedMessage, shownAt: now }
  toast.success(normalizedMessage, { id: API_SUCCESS_TOAST_ID })
}

const showApiErrorToast = (message: string) => {
  const normalizedMessage = message?.trim()
  if (!normalizedMessage) return

  const now = Date.now()
  const isDuplicateWithinWindow =
    lastApiErrorToast.message === normalizedMessage &&
    now - lastApiErrorToast.shownAt < API_ERROR_DEDUP_WINDOW_MS

  if (isDuplicateWithinWindow) return

  lastApiErrorToast = { message: normalizedMessage, shownAt: now }
  toast.error(normalizedMessage, { id: API_ERROR_TOAST_ID })
}

const isAuthSurfacePath = () => {
  const { pathname } = window.location
  return pathname === '/' || pathname.includes('/login')
}

const getValidationErrorMessage = (details: any[] | undefined, fallback: string) => {
  if (!details || !Array.isArray(details) || details.length === 0) {
    return fallback
  }

  const firstError = details[0]
  const firstMessage = firstError?.field
    ? `${firstError.field}: ${firstError.message}`
    : firstError?.message || fallback

  const remainingCount = details.length - 1
  return remainingCount > 0 ? `${firstMessage} (+${remainingCount} more error(s))` : firstMessage
}

const extractApiErrorMessage = async (data: any, fallback: string) => {
  if (data instanceof Blob) {
    try {
      const text = await data.text()
      if (!text) return fallback
      try {
        const parsed = JSON.parse(text)
        return parsed?.message || parsed?.error || text || fallback
      } catch {
        return text || fallback
      }
    } catch {
      return fallback
    }
  }

  if (typeof data === 'string' && data.trim()) {
    try {
      const parsed = JSON.parse(data)
      return parsed?.message || parsed?.error || data
    } catch {
      return data
    }
  }

  if (data && typeof data === 'object') {
    return data?.message || data?.error || fallback
  }

  return fallback
}

// Export function to set store dispatch
export const setStoreDispatch = (dispatch: any) => {
  storeDispatch = dispatch
}

// Create axios instance
const api: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Request interceptor
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const tenantHeader = getTenantHeader()

    if (config.headers) {
      if (tenantHeader) {
        config.headers['x-tenant-slug'] = tenantHeader
      }

      const sessionHeader = getAcademicSessionHeader()
      if (sessionHeader) {
        config.headers['x-academic-session'] = sessionHeader
      }
    }

    // Add auth token to requests
    const token = getAuthToken()
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`
      sessionExpiredToastShown = false // reset so next session expiry can show one toast
    }

    // Add timestamp to prevent caching
    config.params = {
      ...config.params,
      ...(isLocalRuntime() && tenantHeader ? { tenant: tenantHeader } : {}),
      _t: Date.now(),
    }

    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// Response interceptor
api.interceptors.response.use(
  (response: AxiosResponse) => {
    // Handle successful responses
    if (response.data?.success) {
      // Show success toast for certain operations (unless caller opted out)
      const method = response.config.method?.toUpperCase()
      const isModifyingOperation = ['POST', 'PUT', 'DELETE'].includes(method || '')
      const isSilent = (response.config as any)?._silent === true

      if (isModifyingOperation && response.data.message && !isSilent) {
        showApiSuccessToast(response.data.message)
      }
    }

    return response
  },
  async (error) => {
    const originalRequest = error.config

    // Requests aborted by the caller (e.g. a superseded search) are not errors.
    if (axios.isCancel(error)) {
      return Promise.reject(error)
    }

    // Handle network errors
    if (!error.response) {
      showApiErrorToast('Network error. Please check your connection.')
      return Promise.reject(error)
    }

    const { status, data } = error.response

    // Handle different error status codes
    switch (status) {
      case 400: {
        // Bad Request - show validation errors (unless caller opted out)
        const isSilent400 = (error.config as any)?._silent === true
        if (!isSilent400) {
          showApiErrorToast(getValidationErrorMessage(data?.details, data?.error || 'Bad request'))
        }
        break
      }

      case 401:
        // Unauthorized - try to refresh token or handle auth failure
        if (!originalRequest._retry) {
          originalRequest._retry = true

          const refreshToken = getRefreshToken()
          if (refreshToken) {
            try {
              const tenantHeader = getTenantHeader()
              const response = await axios.post(
                `${API_BASE_URL}/auth/refresh`,
                { refreshToken },
                tenantHeader
                  ? {
                      headers: {
                        'x-tenant-slug': tenantHeader,
                      },
                    }
                  : undefined
              )

              if (response.data.success) {
                const newToken = response.data.data.accessToken
                setStoredToken(newToken)
                api.defaults.headers.common['Authorization'] = `Bearer ${newToken}`
                originalRequest.headers.Authorization = `Bearer ${newToken}`

                return api(originalRequest)
              }
            } catch (refreshError) {
              // Refresh failed, clear storage and let Redux handle the auth state
              clearAuthData()
              delete api.defaults.headers.common['Authorization']

              // Dispatch logout action to Redux store
              if (storeDispatch) {
                storeDispatch({ type: 'auth/clearCredentials' })
              }

              // Show session-expired toast only once (multiple requests can 401 together)
              if (!isAuthSurfacePath() && !sessionExpiredToastShown) {
                sessionExpiredToastShown = true
                showApiErrorToast('Session expired. Please login again.')
              }

              return Promise.reject(refreshError)
            }
          } else {
            // No refresh token, clear storage and let Redux handle auth state
            clearAuthData()
            delete api.defaults.headers.common['Authorization']

            // Dispatch logout action to Redux store
            if (storeDispatch) {
              storeDispatch({ type: 'auth/clearCredentials' })
            }

            if (!isAuthSurfacePath() && !sessionExpiredToastShown) {
              sessionExpiredToastShown = true
              showApiErrorToast('Please login to continue')
            }
          }
        }
        break

      case 403: {
        // Forbidden - skip toast when feature is disabled for tenant (silent)
        const isFeatureDisabled =
          (typeof data?.featureKey === 'string' && data.featureKey.length > 0) ||
          (typeof data?.message === 'string' && data.message.includes('disabled by platform admin'))
        if (!isFeatureDisabled) {
          showApiErrorToast('You do not have permission to perform this action')
        }
        break
      }

      case 402:
        // Billing restriction
        showApiErrorToast(data?.message || 'Billing restriction applied. Open Billing to continue.')
        break

      case 404: {
        const isSilent404 = (error.config as any)?._silent === true
        if (!isSilent404) {
          showApiErrorToast(data?.error || data?.message || 'Resource not found')
        }
        break
      }

      case 409:
        // Conflict
        showApiErrorToast(data?.error || 'Resource already exists')
        break

      case 422:
        // Unprocessable Entity - validation errors
        showApiErrorToast(getValidationErrorMessage(data?.details, data?.error || 'Validation failed'))
        break

      case 429:
        // Too Many Requests
        showApiErrorToast('Too many requests. Please try again later.')
        break

      case 500:
        // Internal Server Error
        if ((error.config as any)?._silent === true) break
        showApiErrorToast(await extractApiErrorMessage(data, 'Server error. Please try again later.'))
        break

      default:
        // Other errors
        showApiErrorToast(data?.error || 'An unexpected error occurred')
    }

    return Promise.reject(error)
  }
)

// Helper function to handle file uploads
export const uploadFile = async (
  endpoint: string,
  file: File,
  additionalData?: Record<string, any>,
  onProgress?: (progress: number) => void,
  timeoutMs = 180000
): Promise<AxiosResponse> => {
  const formData = new FormData()
  formData.append('file', file)

  if (additionalData) {
    Object.entries(additionalData).forEach(([key, value]) => {
      formData.append(key, value)
    })
  }

  return api.post(endpoint, formData, {
    timeout: timeoutMs,
    headers: {
      'Content-Type': 'multipart/form-data',
    },
    onUploadProgress: (progressEvent) => {
      if (onProgress && progressEvent.total) {
        const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total)
        onProgress(progress)
      }
    },
  })
}

// Helper function to download files
export const downloadFile = async (
  endpoint: string,
  filename?: string
): Promise<void> => {
  try {
    const response = await api.get(endpoint, {
      responseType: 'blob',
    })

    // Create blob link to download
    const url = window.URL.createObjectURL(new Blob([response.data]))
    const link = document.createElement('a')
    link.href = url

    const inferExtensionFromContentType = (contentType?: string) => {
      const normalized = String(contentType || '').toLowerCase()
      if (normalized.includes('application/pdf')) return '.pdf'
      if (normalized.includes('text/csv')) return '.csv'
      if (normalized.includes('application/json')) return '.json'
      if (normalized.includes('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')) return '.xlsx'
      if (normalized.includes('application/vnd.ms-excel')) return '.xls'
      return ''
    }

    // Get filename from response headers or use provided filename
    const contentDisposition = String(response.headers['content-disposition'] || '')
    const contentType = String(response.headers['content-type'] || '')
    let downloadFilename = filename

    if (contentDisposition) {
      const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i)
      if (utf8Match?.[1]) {
        downloadFilename = decodeURIComponent(utf8Match[1])
      } else {
        const filenameMatch = contentDisposition.match(/filename="?([^"]+)"?/i)
        if (filenameMatch?.[1]) {
          downloadFilename = filenameMatch[1]
        }
      }
    }

    if (!downloadFilename || !/\.[a-z0-9]+$/i.test(downloadFilename)) {
      const extension = inferExtensionFromContentType(contentType)
      downloadFilename = `${downloadFilename || 'download'}${extension}`
    }

    link.setAttribute('download', downloadFilename || 'download')
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.URL.revokeObjectURL(url)
  } catch (error: any) {
    // When responseType is 'blob', error response body is a Blob; parse it to get server error message
    if (error?.response?.data instanceof Blob) {
      try {
        const text = await error.response.data.text()
        const json = JSON.parse(text)
        if (typeof json?.error === 'string') {
          error.serverMessage = json.error
        }
      } catch (_) {
        // ignore parse errors
      }
    }
    // Do not toast here so the caller can show a single toast with server message or fallback
    throw error
  }
}

// Export the configured axios instance
export default api
