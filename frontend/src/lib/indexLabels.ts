/**
 * Etiquetas en castellano de la calculadora de actualización.
 *
 * Viven acá y no en el componente por la misma razón que `propertyLabels.ts` y
 * `domainLabels.ts`: son texto de producto, se prueban solas y las puede
 * necesitar más de una pantalla.
 *
 * Cómo se llama un tramo es presentación pura y depende de la periodicidad que
 * eligió quien calcula, así que lo decide el frontend: el backend numera los
 * tramos y nada más.
 */

const MESES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
]

/** Mes en castellano de una fecha ISO. */
export function nombreMes(fechaIso: string): string {
  return MESES[Number(fechaIso.slice(5, 7)) - 1] ?? ''
}

/** Mes anterior al de una fecha ISO. Es lo que rotula la tarjeta HASTA. */
export function mesAnterior(fechaIso: string): string {
  const mes = Number(fechaIso.slice(5, 7))
  return MESES[mes === 1 ? 11 : mes - 2] ?? ''
}

const PREFIJOS: Record<number, string> = {
  1: 'Mes',
  2: 'Bim.',
  3: 'Trim.',
  4: 'Cuatrim.',
  6: 'Semes.',
  12: 'Año',
}

/** Cómo se llama el tramo N de un contrato que se ajusta cada `mesesPeriodo`. */
export function etiquetaTramo(mesesPeriodo: number, numero: number): string {
  return `${PREFIJOS[mesesPeriodo] ?? 'Período'} ${numero}`
}
