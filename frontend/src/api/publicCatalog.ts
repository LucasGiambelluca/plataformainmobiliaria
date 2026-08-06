import { getJson } from '../lib/api'
import {
  publicAgenciesResponseSchema,
  publicCatalogResponseSchema,
  publicCitiesResponseSchema,
  publicLocalidadesResponseSchema,
  publicPropertyResponseSchema,
  type OperationType,
  type PropertyType,
  type PublicAgency,
  type PublicCatalogResponse,
  type PublicPropertyDetail,
} from './schemas'

export interface CatalogParams {
  search?: string
  operationType?: OperationType
  propertyType?: PropertyType
  city?: string
  minPrice?: number
  maxPrice?: number
  minRooms?: number
  agency?: string
  /** Solo destacadas (carrusel de la home). */
  onlyFeatured?: boolean
  page?: number
  pageSize?: number
  sort?: 'relevance' | 'recent' | 'price_asc' | 'price_desc'
}

/**
 * Catálogo abierto. No manda credenciales ni token: son los endpoints públicos.
 * Qué propiedades son visibles lo decide el backend, acá no hay filtro de estado.
 */
export function getCatalog(params: CatalogParams = {}): Promise<PublicCatalogResponse> {
  // El backend lee los booleanos como "true"/"false" en la query.
  const query = Object.fromEntries(
    Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== '')
      .map(([k, v]) => [k, typeof v === 'boolean' ? String(v) : v]),
  )
  return getJson('/public/properties', publicCatalogResponseSchema, query)
}

export async function getPublicProperty(id: string): Promise<PublicPropertyDetail> {
  const { property } = await getJson(
    `/public/properties/${id}`,
    publicPropertyResponseSchema,
  )
  return property
}

/** Localidades con propiedades publicadas, con su conteo. Alimenta los filtros. */
export async function getCities(): Promise<{ city: string; count: number }[]> {
  const { cities } = await getJson('/public/cities', publicCitiesResponseSchema)
  return cities
}

/**
 * Catálogo completo de localidades donde opera la plataforma, tengan
 * propiedades o no. Llena los desplegables del alta de propiedad y del
 * formulario de tasación.
 */
export async function getLocalidades(): Promise<string[]> {
  const { localidades } = await getJson(
    '/public/localidades',
    publicLocalidadesResponseSchema,
  )
  return localidades
}

/** Inmobiliarias activas, con cuántas propiedades visibles publica cada una. */
export async function getAgencies(): Promise<PublicAgency[]> {
  const { agencies } = await getJson('/public/agencies', publicAgenciesResponseSchema)
  return agencies
}
