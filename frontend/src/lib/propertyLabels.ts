import type { OperationType, PropertyType } from '../api/schemas'

// Etiquetas en español para los enums del backend. Viven acá y no en un
// componente porque las usan el panel, el catálogo público y la ficha.

export const typeLabels: Record<PropertyType, string> = {
  house: 'Casa',
  apartment: 'Departamento',
  land: 'Terreno',
  office: 'Oficina',
  warehouse: 'Galpón',
  commercial: 'Local comercial',
}

export const operationLabels: Record<OperationType, string> = {
  sale: 'Venta',
  rent: 'Alquiler',
  temporary_rental: 'Alquiler temporario',
}

export const typeOptions = Object.entries(typeLabels).map(([value, label]) => ({
  value,
  label,
}))

export const operationOptions = Object.entries(operationLabels).map(([value, label]) => ({
  value,
  label,
}))

/** Los montos llegan como string decimal para no perder precisión. */
export function formatPrice(price: string, currency: string): string {
  const formatted = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(
    Number(price),
  )
  return currency === 'USD' ? `USD ${formatted}` : `$ ${formatted}`
}

/** Superficie en m², o cadena vacía si la propiedad no la declara. */
export function formatArea(areaM2: string | null): string {
  return areaM2 === null ? '' : `${Number(areaM2)} m²`
}
