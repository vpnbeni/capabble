import React, { useEffect, useState } from 'react'
import { useSelector } from 'react-redux'
import toast from 'react-hot-toast'
import { selectUser } from '@/redux/slices/authSlice'
import { Banner } from '@/components/ui'
import authService from '@/services/authService'
import { setStoredUser } from '@/utils/authStorage'
import '@/components/billing/billing.css'

/**
 * Reload the app as whoever the session now belongs to (after starting or
 * stopping "view as"), so no page or cache keeps the previous person's data.
 */
export const reloadAsCurrentLogin = async (path: string) => {
  const response = await authService.getCurrentUser()
  if (response.data) setStoredUser(response.data)
  window.location.hash = `#${path}`
  window.location.reload()
}

/** One line above every page while an administrator is viewing as someone, or the owner switched to them. */
const ViewAsBanner: React.FC = () => {
  const user = useSelector(selectUser)
  const viewAs = user?.viewAs
  const [stopping, setStopping] = useState(false)

  const stop = async () => {
    if (stopping || !user) return
    setStopping(true)
    try {
      await authService.stopViewAs()
      // A switch started from the users list goes back to it; View as started on the person's page.
      await reloadAsCurrentLogin(viewAs?.mode === 'switch' ? '/settings/users' : `/settings/users/${user._id}`)
    } catch {
      setStopping(false)
      toast.error("Couldn't stop viewing. Check your connection and try again.")
    }
  }

  // The server ends it after 30 minutes; follow it then.
  useEffect(() => {
    if (!viewAs) return undefined
    const ms = new Date(viewAs.expiresAt).getTime() - Date.now()
    const timer = window.setTimeout(() => {
      reloadAsCurrentLogin('/').catch(() => window.location.reload())
    }, Math.max(0, ms) + 1000)
    return () => window.clearTimeout(timer)
  }, [viewAs])

  if (!viewAs || !user) return null

  const name = user.name || user.email || user.username || 'this person'
  const role = user.kind === 'staff'
    ? user.roles.map((entry) => entry.name).join(', ')
    : user.kind === 'parent' ? 'Parent' : 'Student'
  const until = new Date(viewAs.expiresAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })
  const switched = viewAs.mode === 'switch'
  const who = `${name}${role ? ` (${role})` : ''}`
  const full = switched
    ? `Switched to ${who}. Changes are saved as them. Ends at ${until}.`
    : `Viewing as ${who}. Read-only: nothing can be changed. Ends at ${until}.`

  return (
    <div className="cb-app bl-shell-banner">
      <Banner
        tone="warning"
        title={
          <>
            <span className="bl-shell-banner__full">
              {full}
            </span>
            <span className="bl-shell-banner__short">{switched ? `Switched to ${name}` : `Viewing as ${name} · read-only`}</span>
          </>
        }
      >
        <button type="button" className="cb-link" onClick={stop} disabled={stopping}>
          {stopping ? 'Stopping…' : switched ? 'Switch back' : 'Stop viewing'}
        </button>
      </Banner>
    </div>
  )
}

export default ViewAsBanner
