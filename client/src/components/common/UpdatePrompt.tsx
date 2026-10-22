import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { useRegisterSW } from 'virtual:pwa-register/react'

const UPDATE_CHECK_MS = 60 * 60 * 1000

/**
 * Registers the service worker and offers a reload when a new version is deployed.
 * Never reloads on its own: a half-filled form would be lost.
 */
const UpdatePrompt = () => {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      // Staff keep the panel open all day; look for a new version every hour.
      if (registration) setInterval(() => registration.update().catch(() => {}), UPDATE_CHECK_MS)
    },
  })

  if (!needRefresh) return null

  return createPortal(
    <div className="cb-app">
      <div className="cb-toaster">
        <div className="cb-toast" role="status">
          <div className="cb-toast__text">
            <div className="cb-toast__title">A new version of Capabble is ready</div>
            <div className="cb-toast__desc">Save any open work, then reload.</div>
          </div>
          <button type="button" className="cb-toast__action" onClick={() => updateServiceWorker(true)}>
            Reload now
          </button>
          <button type="button" className="cb-toast__close" aria-label="Dismiss" onClick={() => setNeedRefresh(false)}>
            <X size={16} />
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

export default UpdatePrompt
