import { getJson } from '../lib/api'
import {
  publicCatalogResponseSchema,
  publicCitiesResponseSchema,
  publicPropertyResponseSchema,
  type OperationType,
  type PropertyType,
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

export async function getCities(): Promise<{ city: string; count: number }[]> {
  const { cities } = await getJson('/public/cities', publicCitiesResponseSchema)
  return cities
}
