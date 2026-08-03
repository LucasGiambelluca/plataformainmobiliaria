/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** URL base de la API. Ej: http://localhost:3000/api */
  readonly VITE_API_URL?: string
  /**
   * Dominio del portal. Ej: plataforma.com
   *
   * Sirve para distinguir el portal de la web de una inmobiliaria servida por
   * subdominio o por dominio propio. Sin definir, todo host es el portal.
   */
  readonly VITE_PLATFORM_DOMAIN?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
