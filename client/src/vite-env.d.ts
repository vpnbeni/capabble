/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string
  readonly VITE_LOCAL_API_URL: string
  readonly VITE_ROOT_APP_DOMAIN: string
  readonly VITE_ROOT_API_DOMAIN: string
  readonly VITE_APP_NAME: string
  readonly VITE_APP_VERSION: string
  // Add more environment variables as needed
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
