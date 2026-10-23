// Metro config. The app is not an npm workspace (it runs React 19, the web apps
// React 18), so shared files are reached by watching packages/shared directly.
const path = require('path')
const { getDefaultConfig } = require('expo/metro-config')

const sharedRoot = path.resolve(__dirname, '../packages/shared')

const config = getDefaultConfig(__dirname)

config.watchFolders = [...(config.watchFolders || []), sharedRoot]
config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules || {}),
  '@capabble/shared': path.join(sharedRoot, 'src'),
}
// Files under packages/shared resolve packages from this app's node_modules,
// never from the repo root (which holds the web apps' React 18).
config.resolver.nodeModulesPaths = [path.resolve(__dirname, 'node_modules')]

module.exports = config
