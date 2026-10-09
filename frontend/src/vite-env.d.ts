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
  /**
   * "true" deja el sitio público solo con el header: el contenido y el footer no
   * se dibujan. Es el modo provisorio de producción mientras se rediseña el
   * resto con la marca M2Prop. El login y los paneles siguen andando.
   */
  readonly VITE_SOLO_HEADER?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
