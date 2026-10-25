import { Linking } from 'react-native'

import { webPageUrl } from '@/lib/config'
import { usePermissions } from '@/lib/permissions'
import { useSession } from '@/session/SessionProvider'

import { staffModeFor, type StaffMode } from './access'

/** The signed-in staff login: its permissions and which staff app it gets. null mode for families. */
export function useStaff() {
  const session = useSession()
  const perms = usePermissions()
  const user = session.status === 'signedIn' ? session.user : null
  const mode: StaffMode | null = user?.kind === 'staff' ? staffModeFor(user, perms) : null
  return { ...perms, mode, user }
}

/** Opens a page of the school website in the browser. */
export const openWebsite = (path: string) => Linking.openURL(webPageUrl(path))
