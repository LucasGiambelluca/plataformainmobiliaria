/**
 * Desde qué host se está sirviendo la aplicación (tarea 4.11).
 *
 * El backend ya resuelve la inmobiliaria por `Host` (`resolveTenant`), pero el
 * bundle es uno solo para todos los dominios: sin esto, entrar a
 * inmobiliarianorte.com.ar muestra la home del portal en vez de la web de esa
 * inmobiliaria.
 *
 * Es el espejo en el navegador de `shared/middleware/resolveTenant.ts`. Las dos
 * listas de subdominios reservados tienen que decir lo mismo: si acá falta uno,
 * la SPA pide `/api/public/sites/current` para un host que el backend nunca va a
 * resolver, y la pantalla queda en error.
 */

export const PLATFORM_DOMAIN = (import.meta.env.VITE_PLATFORM_DOMAIN ?? '')
  .trim()
  .toLowerCase()

/** Subdominios que nunca son una inmobiliaria. Igual que en el backend. */
const RESERVADOS = new Set(['www', 'api', 'admin', 'app', 'cdn', 'static', 'mail'])

/** Hosts de desarrollo: siempre el portal, aunque no coincidan con el dominio. */
function esLocal(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '[::1]' ||
    hostname.endsWith('.localhost')
  )
}

/**
 * Si este host es la web de una inmobiliaria (subdominio o dominio propio) en
 * vez del portal.
 *
 * Sin `VITE_PLATFORM_DOMAIN` siempre devuelve false: en desarrollo se entra por
 * localhost y el sitio de una inmobiliaria se ve por `/inmobiliaria/:slug`.
 */
export function isTenantHost(hostname: string = window.location.hostname): boolean {
  const host = hostname.trim().toLowerCase()
  if (!PLATFORM_DOMAIN || !host || esLocal(host)) return false

  // El portal y su www.
  if (host === PLATFORM_DOMAIN || host === `www.${PLATFORM_DOMAIN}`) return false

  if (host.endsWith(`.${PLATFORM_DOMAIN}`)) {
    const label = host.slice(0, -(PLATFORM_DOMAIN.length + 1))
    // Un solo nivel: "a.b.plataforma.com" no es el tenant "a.b".
    return Boolean(label) && !label.includes('.') && !RESERVADOS.has(label)
  }

  // Cualquier otro dominio llegó acá porque alguien lo apuntó al VPS y Caddy le
  // emitió certificado, y eso solo pasa si el backend lo autorizó.
  return true
}

/**
 * Enlace al portal. Dentro de la web de una inmobiliaria tiene que ser absoluto:
 * "/" es la home de ella, no la del portal.
 */
export function portalHref(hostname: string = window.location.hostname): string {
  return isTenantHost(hostname) ? `https://${PLATFORM_DOMAIN}` : '/'
}
