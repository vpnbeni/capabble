import { createPortal } from 'react-dom'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { X } from './icons'

const UPDATE_CHECK_MS = 60 * 60 * 1000

/** Registers the service worker and offers a reload when a new version is deployed. */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (registration) setInterval(() => registration.update().catch(() => {}), UPDATE_CHECK_MS)
    },
  })

  if (!needRefresh) return null

  return createPortal(
    <div className="cb-app">
      <div className="cb-toaster">
        <div className="cb-toast" role="status">
          <div className="cb-toast__text">
            <div className="cb-toast__title">A new version of the admin portal is ready</div>
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
