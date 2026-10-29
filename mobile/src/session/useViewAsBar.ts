import { useRouter } from 'expo-router'
import { useEffect, useState } from 'react'

import { useSession } from './SessionProvider'

/**
 * The bar shown above every screen while an administrator views the app as someone else
 * (read-only, see server rbac/viewAs), or null. Also ends it when the server's 30 minutes are up.
 */
export function useViewAsBar() {
  const session = useSession()
  const router = useRouter()
  const [stopping, setStopping] = useState(false)
  const user = session.status === 'signedIn' ? session.user : null
  const viewAs = user?.viewAs ?? null
  const { stopViewAs } = session

  const stop = async () => {
    if (stopping || !user) return
    setStopping(true)
    const viewedId = user._id
    const switched = viewAs?.mode === 'switch'
    try {
      await stopViewAs()
      if (router.canDismiss()) router.dismissAll()
      router.replace('/')
      // A switch started from the users list goes back to it; View as started on the person's screen.
      if (switched) router.push('/users')
      else router.push({ pathname: '/users/[id]', params: { id: viewedId } })
    } catch {
      // Still viewing (offline): the bar stays and they can try again.
    } finally {
      setStopping(false)
    }
  }

  useEffect(() => {
    if (!viewAs) return undefined
    const ms = new Date(viewAs.expiresAt).getTime() - Date.now()
    const timer = setTimeout(() => {
      stopViewAs()
        .then(() => {
          if (router.canDismiss()) router.dismissAll()
          router.replace('/')
        })
        .catch(() => {})
    }, Math.max(0, ms) + 1000)
    return () => clearTimeout(timer)
  }, [viewAs, stopViewAs, router])

  if (!user || !viewAs) return null
  const name = user.name || user.email || user.username || 'this person'
  return {
    tone: 'warning' as const,
    title: viewAs.mode === 'switch' ? `Switched to ${name}` : `Viewing as ${name} · read-only`,
    action: { label: stopping ? 'Stopping…' : viewAs.mode === 'switch' ? 'Switch back' : 'Stop', onPress: stop, busy: stopping },
  }
}
