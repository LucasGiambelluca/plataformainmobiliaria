// Access token vivo de la sesión.
//
// Se guarda SOLO en memoria (nunca localStorage/sessionStorage): un XSS no puede
// robar un token que no está en el storage. La sesión persiste entre recargas
// gracias a la cookie httpOnly de refresh que emite el backend, no acá.
//
// Este módulo existe aparte del cliente HTTP y del store para romper el ciclo
// de imports: api.ts lee el token, el store lo escribe, ninguno depende del otro.

let accessToken: string | null = null
let onExpired: (() => void) | null = null

export function getAccessToken(): string | null {
  return accessToken
}

export function setAccessToken(token: string | null): void {
  accessToken = token
}

/** Registra el callback que corre cuando el refresh falla (sesión muerta). */
export function setSessionExpiredHandler(handler: (() => void) | null): void {
  onExpired = handler
}

export function notifySessionExpired(): void {
  accessToken = null
  onExpired?.()
}

/**
 * Bandera de suplantación.
 *
 * Vive acá y no en el store por el mismo ciclo de imports que documenta el
 * encabezado de este archivo: `api.ts` la lee, el store la escribe, y ninguno
 * de los dos importa al otro.
 */
let impersonating = false
let onImpersonationEnded: (() => void) | null = null

export function isImpersonating(): boolean {
  return impersonating
}

export function setImpersonating(value: boolean): void {
  impersonating = value
}

/** Registra el callback que corre cuando la sesión de soporte deja de valer. */
export function setImpersonationEndedHandler(handler: (() => void) | null): void {
  onImpersonationEnded = handler
}

export function notifyImpersonationEnded(): void {
  accessToken = null
  impersonating = false
  onImpersonationEnded?.()
}
