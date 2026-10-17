import permissionCatalog from '@capabble/shared/permissionCatalog.json'
import type { User } from '@/types/auth'

// Built-in roles in catalog order, most senior first.
const TEMPLATE_RANK = new Map(permissionCatalog.roleTemplates.map((role, index) => [role.key, index]))
// Add-on roles sit on top of a main role, so they never name the desk.
const ADDON_ROLES = new Set(['appointment_host'])

/**
 * Name of the Home dashboard for the signed-in user, from their most senior role:
 * "Principal Desk", "Accountant Desk", a custom role's name, and so on.
 */
export const deskTitle = (user: User | null | undefined): string => {
  const ranked = [...(user?.roles || [])]
    .filter((role) => role.name)
    .sort((a, b) => rankOf(a.key) - rankOf(b.key))
  const name = ranked[0]?.name || (user?.isAdmin ? 'Administrator' : '')
  return name ? `${name} Desk` : 'Home'
}

const rankOf = (key: string) => {
  if (ADDON_ROLES.has(key)) return Number.MAX_SAFE_INTEGER
  // Custom roles rank after the built-in main roles.
  return TEMPLATE_RANK.get(key) ?? TEMPLATE_RANK.size
}
