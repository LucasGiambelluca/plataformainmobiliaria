/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** URL base de la API. Ej: http://localhost:3000/api */
  readonly VITE_API_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
