import { API_BASE_URL } from './config'

/**
 * Fetch client for the tenant API.
 *
 * Sessions use the same httpOnly cookies as the web app (`cb_at` access, `cb_rt` refresh):
 * iOS and Android keep them in the app's own cookie store, so the app never handles a token.
 * Every request names the school (`x-tenant-slug`) and sends `X-Requested-With`, which the
 * API requires on cookie-authenticated writes.
 */

export class ApiError extends Error {
  status: number
  errorCode?: string

  constructor(message: string, status: number, errorCode?: string) {
    super(message)
    this.status = status
    this.errorCode = errorCode
  }
}

let tenantSlug: string | null = null
let onSessionEnded: (() => void) | null = null
let refreshing: Promise<boolean> | null = null

export const setTenantSlug = (slug: string | null) => {
  tenantSlug = slug
}

export const getTenantSlug = () => tenantSlug

/** Called once when the session can't be refreshed (signed out elsewhere, password changed). */
export const setSessionEndedHandler = (handler: (() => void) | null) => {
  onSessionEnded = handler
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: unknown
  params?: Record<string, string | number | undefined>
  /** Base URL other than the tenant API (the platform's public lookups). */
  baseUrl?: string
  /** Don't try to refresh the session on a 401 (sign-in, refresh itself). */
  skipRefresh?: boolean
  /** Return the whole response body, for the few endpoints that put fields next to `data`. */
  raw?: boolean
}

const buildUrl = (path: string, base: string, params?: RequestOptions['params']) => {
  const query = Object.entries(params || {})
    .filter(([, value]) => value !== undefined && value !== '')
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join('&')
  return `${base}${path}${query ? `?${query}` : ''}`
}

const send = async (path: string, options: RequestOptions) => {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
  }
  if (tenantSlug) headers['x-tenant-slug'] = tenantSlug
  if (options.body !== undefined) headers['Content-Type'] = 'application/json'

  return fetch(buildUrl(path, options.baseUrl ?? API_BASE_URL, options.params), {
    method: options.method ?? 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    credentials: 'include',
  })
}

const readError = async (response: Response) => {
  let body: { error?: string; message?: string; errorCode?: string; details?: { message?: string }[] } = {}
  try {
    body = await response.json()
  } catch {
    // Not JSON (proxy error page): fall through to the generic message.
  }
  // Joi failures arrive as "Validation failed" plus one message per field; the field's message says what to fix.
  const fieldMessage = body.error === 'Validation failed' ? body.details?.[0]?.message?.replace(/"/g, '') : undefined
  const message = fieldMessage || body.error || body.message || "Couldn't reach the school's server. Check your connection and try again."
  return new ApiError(message, response.status, body.errorCode)
}

/** Rotate the refresh cookie. Shared by every request that hits a 401 at the same time. */
export const refreshSession = () => {
  refreshing ??= send('/auth/refresh', { method: 'POST', skipRefresh: true })
    .then((response) => response.ok)
    .catch(() => false)
    .finally(() => {
      refreshing = null
    })
  return refreshing
}

/** Calls the API and returns the response's `data`. Throws ApiError with the server's message. */
export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  let response: Response
  try {
    response = await send(path, options)
  } catch {
    throw new ApiError("You're offline. Check your connection and try again.", 0, 'network')
  }

  if (response.status === 401 && !options.skipRefresh) {
    if (await refreshSession()) {
      response = await send(path, options)
    }
    if (response.status === 401) {
      onSessionEnded?.()
    }
  }

  if (!response.ok) throw await readError(response)
  const body = await response.json()
  return (options.raw ? body : body.data) as T
}

/** A file the API sends back (a receipt, a report card, an ID card PDF), as bytes. */
export async function requestBytes(path: string, options: Omit<RequestOptions, 'raw'> = {}): Promise<ArrayBuffer> {
  let response: Response
  try {
    response = await send(path, options)
  } catch {
    throw new ApiError("You're offline. Check your connection and try again.", 0, 'network')
  }
  if (response.status === 401 && !options.skipRefresh && (await refreshSession())) response = await send(path, options)
  if (response.status === 401) onSessionEnded?.()
  if (!response.ok) throw await readError(response)
  return response.arrayBuffer()
}

export const api = {
  get: <T>(path: string, params?: RequestOptions['params'], options?: Omit<RequestOptions, 'method' | 'body' | 'params'>) => request<T>(path, { ...options, params }),
  post: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...options, method: 'POST', body: body ?? {} }),
  put: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...options, method: 'PUT', body: body ?? {} }),
  patch: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...options, method: 'PATCH', body: body ?? {} }),
  delete: <T>(path: string, params?: RequestOptions['params']) => request<T>(path, { method: 'DELETE', params }),
}
