import { useMemo } from 'react'

import permissionCatalog from '@capabble/shared/permissionCatalog.json'
import type { User } from '@/services/authService'
import { useSession } from '@/session/SessionProvider'

// Mirrors client/src/hooks/usePermissions.ts and the toggle rules in client/src/constants/featureAccess.ts.
// The server enforces the same rules on every request; this only decides what the app offers.

export type PermissionScope = 'all' | 'assigned'

const FEATURE_PERMISSIONS = permissionCatalog.features as Record<string, string | string[] | null>

// Features hidden unless a platform admin turned them on (same list as the web).
const OPT_IN_FEATURES = new Set(['school_hub', 'appnt_desk'])

export interface Permissions {
  /** True when the login holds any of the keys (administrators hold everything). */
  can: (keys: string | string[]) => boolean
  /** `all`, `assigned` (own classes only) or null when not held. */
  scopeOf: (key: string) => PermissionScope | null
  /** Whether the school has this feature on (`tenantFeatureCatalog.json` key). */
  featureOn: (featureKey: string) => boolean
  /** The feature is on and the login holds the permission the web asks for it. */
  canUse: (featureKey: string) => boolean
  isAdmin: boolean
}

export const buildPermissions = (user: User | null | undefined): Permissions => {
  const isAdmin = Boolean(user?.isAdmin)
  const grants = new Map((user?.permissions ?? []).map((grant) => [grant.key, grant.scope]))
  const toggles = user?.featureToggles
  const can = (keys: string | string[]) => {
    if (!user || user.kind !== 'staff') return false
    if (isAdmin) return true
    return ([] as string[]).concat(keys).some((key) => grants.has(key))
  }
  const featureOn = (featureKey: string) =>
    OPT_IN_FEATURES.has(featureKey) ? toggles?.[featureKey] === true : toggles?.[featureKey] !== false
  return {
    can,
    scopeOf: (key) => (!user || user.kind !== 'staff' ? null : isAdmin ? 'all' : grants.get(key) ?? null),
    featureOn,
    canUse: (featureKey) => {
      const permission = FEATURE_PERMISSIONS[featureKey]
      return featureOn(featureKey) && (!permission || can(permission))
    },
    isAdmin,
  }
}

/** The signed-in staff login's permissions; families get none. */
export function usePermissions(): Permissions {
  const session = useSession()
  const user = session.status === 'signedIn' ? session.user : null
  return useMemo(() => buildPermissions(user), [user])
}
