import type { DomainStatus } from '../api/schemas'

/**
 * Etiquetas de los estados de un dominio. Viven acá y no en un componente
 * porque las comparten el panel de la inmobiliaria y el panel global.
 */
export const domainStatusLabels: Record<DomainStatus, string> = {
  pending: 'Sin verificar',
  verifying: 'Propagando',
  active: 'Activo',
  failed: 'Mal apuntado',
}

export const domainStatusTone: Record<DomainStatus, 'success' | 'warning' | 'neutral' | 'danger'> =
  {
    active: 'success',
    verifying: 'warning',
    pending: 'neutral',
    failed: 'danger',
  }

/** Qué significa cada estado, en criollo. Se muestra debajo del dominio. */
export const domainStatusHelp: Record<DomainStatus, string> = {
  pending: 'Todavía no se verificó. Configurá el DNS y tocá Verificar.',
  verifying: 'El DNS todavía no propagó. Puede tardar hasta 48 h.',
  active: 'El dominio ya sirve tu web con SSL.',
  failed: 'El dominio apunta a otro lado. Revisá el registro en tu proveedor.',
}
