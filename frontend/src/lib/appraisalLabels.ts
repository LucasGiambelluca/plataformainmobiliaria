import type {
  AppraisalCondition,
  AppraisalPropertyType,
  AppraisalPurpose,
  AppraisalStatus,
} from '../api/schemas'

/**
 * Etiquetas en español de los enums de tasaciones.
 *
 * Viven acá y no en un componente porque las comparten el formulario público,
 * la bandeja del panel y la vista del super admin — misma razón que
 * `propertyLabels.ts` y `domainLabels.ts`.
 */

export const appraisalPropertyTypeLabels: Record<AppraisalPropertyType, string> = {
  house: 'Casa',
  apartment: 'Departamento',
  ph: 'PH',
  duplex: 'Dúplex',
  commercial: 'Local comercial',
  office: 'Oficina',
  warehouse: 'Galpón',
  land: 'Terreno',
  farm: 'Campo',
  country_house: 'Quinta',
  ranch: 'Chacra',
  other: 'Otro',
}

export const appraisalPurposeLabels: Record<AppraisalPurpose, string> = {
  sale: 'Venta',
  rent: 'Alquiler',
  sale_and_rent: 'Venta y alquiler',
  other: 'Otro',
}

export const appraisalConditionLabels: Record<AppraisalCondition, string> = {
  excellent: 'Excelente',
  very_good: 'Muy bueno',
  good: 'Bueno',
  fair: 'Regular',
  to_renovate: 'A reciclar',
}

export const appraisalStatusLabels: Record<AppraisalStatus, string> = {
  unassigned: 'Sin asignar',
  new: 'Nueva',
  contacted: 'Contactado',
  completed: 'Tasada',
  discarded: 'Descartada',
}

export const appraisalReasonLabels: Record<string, string> = {
  sale: 'Venta',
  rent: 'Alquiler',
  inheritance: 'Sucesión',
  division: 'División de bienes',
  investment: 'Inversión',
  moving: 'Cambio de vivienda',
  other: 'Otro',
}

export const appraisalTimeframeLabels: Record<string, string> = {
  immediate: 'Inmediatamente',
  within_30_days: 'Dentro de los próximos 30 días',
  '1_to_3_months': 'Entre 1 y 3 meses',
  '3_to_6_months': 'Entre 3 y 6 meses',
  just_curious: 'Solo deseo conocer el valor',
}

/** Ambientes, servicios y comodidades: listas de la spec, en orden. */
export const APPRAISAL_SPACES = [
  'Living',
  'Comedor',
  'Cocina',
  'Lavadero',
  'Escritorio',
  'Dependencia de servicio',
  'Toilette',
  'Cocheras',
]

export const APPRAISAL_SERVICES = [
  'Agua corriente',
  'Gas natural',
  'Cloacas',
  'Electricidad',
  'Pavimento',
  'Internet',
  'Cable',
]

export const APPRAISAL_AMENITIES = [
  'Patio',
  'Jardín',
  'Parrilla',
  'Quincho',
  'Piscina',
  'Balcón',
  'Terraza',
  'Ascensor',
  'Calefacción',
  'Aire acondicionado',
  'Seguridad',
  'SUM',
  'Gimnasio',
]

/** Opciones listas para <Select>, derivadas de las etiquetas. */
export function opcionesDe(labels: Record<string, string>) {
  return Object.entries(labels).map(([value, label]) => ({ value, label }))
}
