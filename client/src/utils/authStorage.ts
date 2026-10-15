/**
 * Browser-side auth state.
 *
 * The session itself lives in httpOnly cookies set by the API: no access or
 * refresh token is ever readable from JavaScript. What we keep here is only the
 * signed-in user's profile (name, roles, permissions) so the app can paint
 * before `/auth/me` confirms the session. It is a hint, not proof: the server
 * checks every request.
 */
const USER_KEY = 'cb-user'
const REMEMBER_ME_KEY = 'becms-stay-signed-in'
// Keys from the previous token-in-storage scheme, removed on sight.
const LEGACY_KEYS = ['token', 'refreshToken', 'user']

type StorageKind = 'local' | 'session'

const hasWindow = () => typeof window !== 'undefined'

const getStorage = (kind: StorageKind): Storage | null => {
  if (!hasWindow()) return null
  try {
    return kind === 'local' ? window.localStorage : window.sessionStorage
  } catch {
    return null
  }
}

const removeLegacyKeys = () => {
  ;[getStorage('local'), getStorage('session')].forEach((storage) => {
    LEGACY_KEYS.forEach((key) => storage?.removeItem(key))
  })
  // redux-persist used to keep the auth slice (including the token) here.
  getStorage('local')?.removeItem('persist:becms-root')
}

export const getRememberPreference = (): boolean => {
  const value = getStorage('local')?.getItem(REMEMBER_ME_KEY)
  if (value === null || value === undefined) return true
  return value === '1'
}

export const setRememberPreference = (remember: boolean): void => {
  getStorage('local')?.setItem(REMEMBER_ME_KEY, remember ? '1' : '0')
}

export const setStoredUser = (user: unknown, remember = getRememberPreference()): void => {
  removeLegacyKeys()
  const target = getStorage(remember ? 'local' : 'session')
  const other = getStorage(remember ? 'session' : 'local')
  other?.removeItem(USER_KEY)
  if (target && user !== undefined && user !== null) target.setItem(USER_KEY, JSON.stringify(user))
}

export const getStoredUser = <T = unknown>(): T | null => {
  const raw = getStorage('local')?.getItem(USER_KEY) ?? getStorage('session')?.getItem(USER_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

/** True when this browser was signed in last time (worth asking the server). */
export const hasSessionHint = (): boolean => Boolean(getStoredUser())

export const clearAuthData = (): void => {
  removeLegacyKeys()
  getStorage('local')?.removeItem(USER_KEY)
  getStorage('session')?.removeItem(USER_KEY)
}
