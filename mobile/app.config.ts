import type { ConfigContext, ExpoConfig } from 'expo/config'

/**
 * The stage app and the live app side by side on one phone: the stage one is "(S) Capabble" with
 * its own app ID and link scheme, so installing one never replaces the other. Live builds set
 * APP_VARIANT=production (eas.json); everything else (preview builds, `expo start`) is stage.
 */
const live = process.env.APP_VARIANT === 'production'

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: live ? 'Capabble' : '(S) Capabble',
  slug: config.slug ?? 'capabble',
  scheme: live ? 'capabble' : 'capabble-stage',
  ios: { ...config.ios, bundleIdentifier: live ? 'cloud.capabble.app' : 'cloud.capabble.app.stage' },
  android: { ...config.android, package: live ? 'cloud.capabble.app' : 'cloud.capabble.app.stage' },
})
