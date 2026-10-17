import { useMemo } from 'react'
import { useSelector } from 'react-redux'
import { selectUser } from '@/redux/slices/authSlice'
import type { AccessContext, PermissionChecker } from '@/constants/featureAccess'
import type { PermissionScope, User } from '@/types/auth'

export interface Permissions {
  /** True when the user holds any of the keys (administrators hold everything). */
  can: PermissionChecker
  /** `all`, `assigned` (own classes only) or null when not held. */
  scopeOf: (key: string) => PermissionScope | null
  isAdmin: boolean
  isPortal: boolean
  /** Pass to featureAccess helpers so pages are filtered by toggles and role. */
  access: AccessContext
}

export const buildPermissions = (user: User | null | undefined): Permissions => {
  const isAdmin = Boolean(user?.isAdmin)
  const grants = new Map((user?.permissions || []).map((grant) => [grant.key, grant.scope]))
  const can: PermissionChecker = (keys) => {
    if (!user) return false
    if (isAdmin) return true
    return ([] as string[]).concat(keys).some((key) => grants.has(key))
  }
  return {
    can,
    scopeOf: (key) => (isAdmin ? 'all' : grants.get(key) ?? null),
    isAdmin,
    isPortal: user?.kind === 'parent' || user?.kind === 'student',
    access: { toggles: user?.featureToggles, can },
  }
}

/**
 * The signed-in user's permissions, for hiding what they can't use. The server
 * enforces the same rules on every request; this only shapes the UI.
 */
export function usePermissions(): Permissions {
  const user = useSelector(selectUser)
  return useMemo(() => buildPermissions(user), [user])
}
