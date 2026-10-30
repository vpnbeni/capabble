#!/usr/bin/env node
/**
 * `npm run android-info`: the newest Android app downloads on EAS, stage and live.
 *
 *   Stage "(S) Capabble"  cloud.capabble.app.stage  (profile preview)
 *   Live  "Capabble"      cloud.capabble.app        (profile production-apk; production builds an AAB for Play)
 *
 * Needs `npx eas-cli login` once on this machine (same Expo account as the builds).
 */
import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const mobileDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'mobile')
const BUILD_PAGE = 'https://expo.dev/accounts/capabble-platforms-llp/projects/capabble/builds'

const APPS = [
  { label: 'Stage  "(S) Capabble"', id: 'cloud.capabble.app.stage', profiles: ['preview'] },
  { label: 'Live   "Capabble"', id: 'cloud.capabble.app', profiles: ['production-apk'] },
]

let builds
try {
  const out = execFileSync('npx', ['eas-cli@latest', 'build:list', '--platform', 'android', '--limit', '30', '--json', '--non-interactive'], {
    cwd: mobileDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  builds = JSON.parse(out)
} catch (error) {
  console.error('Could not read the builds from EAS. Sign in with: cd mobile && npx eas-cli login')
  console.error(String(error.stderr || error.message).trim().split('\n').slice(-3).join('\n'))
  process.exit(1)
}

const day = (iso) => (iso ? new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—')

for (const app of APPS) {
  const mine = builds.filter((build) => build.appIdentifier === app.id && app.profiles.includes(build.buildProfile))
  const ready = mine.find((build) => build.status === 'FINISHED' && build.artifacts?.buildUrl)
  const running = mine.find((build) => ['NEW', 'IN_QUEUE', 'IN_PROGRESS'].includes(build.status))
  console.log(`\n${app.label}  (${app.id})`)
  if (ready) {
    console.log(`  Version   ${ready.appVersion} (build ${ready.appBuildVersion}), from commit ${String(ready.gitCommitHash || '').slice(0, 7)}`)
    console.log(`  Built     ${day(ready.updatedAt || ready.createdAt)}`)
    console.log(`  APK       ${ready.artifacts.buildUrl}`)
    console.log(`  Install   ${BUILD_PAGE}/${ready.id}`)
    if (ready.expirationDate) console.log(`  Link ends ${day(ready.expirationDate)}`)
  } else {
    console.log('  No finished build yet.')
  }
  if (running && (!ready || new Date(running.createdAt) > new Date(ready.createdAt))) {
    console.log(`  Building  a newer one (${running.status.toLowerCase().replace('_', ' ')}): ${BUILD_PAGE}/${running.id}`)
  }
}
console.log('')
