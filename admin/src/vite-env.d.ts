/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />

interface ImportMetaEnv {
  readonly VITE_PLATFORM_API_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
