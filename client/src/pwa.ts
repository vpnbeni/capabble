/**
 * The school app installs as two apps on one origin: the staff panel and the family portal
 * (parents and students). Both share one service worker; only the manifest differs.
 * index.html picks the manifest before first paint; this keeps it in step as the route changes.
 */
const STAFF_MANIFEST = '/manifest.webmanifest'
const FAMILY_MANIFEST = '/family.webmanifest'

const launchedAsFamily = /[?&]app=family\b/.test(window.location.search)

function syncManifest() {
  const link = document.getElementById('app-manifest')
  if (!link) return
  const family = launchedAsFamily || window.location.hash.startsWith('#/portal')
  const href = family ? FAMILY_MANIFEST : STAFF_MANIFEST
  if (link.getAttribute('href') !== href) link.setAttribute('href', href)
  document
    .querySelector('meta[name="apple-mobile-web-app-title"]')
    ?.setAttribute('content', family ? 'Capabble Family' : 'Capabble')
}

export function initPwaManifest() {
  syncManifest()
  window.addEventListener('hashchange', syncManifest)
}

const CHUNK_RELOAD_KEY = 'capabble-chunk-reload'

/**
 * A page left open across a deploy can ask for a code chunk that no longer exists; without this
 * the screen stays blank. Reload once to pick up the new version; the flag stops a reload loop.
 */
export function reloadOnStaleChunk() {
  window.addEventListener('vite:preloadError', (event) => {
    try {
      if (sessionStorage.getItem(CHUNK_RELOAD_KEY)) return
      sessionStorage.setItem(CHUNK_RELOAD_KEY, '1')
    } catch {
      return
    }
    event.preventDefault()
    window.location.reload()
  })
  window.addEventListener('load', () => {
    setTimeout(() => {
      try {
        sessionStorage.removeItem(CHUNK_RELOAD_KEY)
      } catch {
        /* storage blocked */
      }
    }, 10_000)
  })
}
