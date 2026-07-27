import { api, getJson, patchJson, postJson } from '../lib/api'
import {
  propertyListResponseSchema,
  propertyResponseSchema,
  type PropertyDetail,
  type PropertyForm,
  type PropertyListResponse,
  type PropertyStatus,
} from './schemas'

export interface ListPropertiesParams {
  search?: string
  status?: PropertyStatus
  page?: number
  pageSize?: number
  sort?: 'recent' | 'price_asc' | 'price_desc' | 'views'
}

export function listProperties(
  params: ListPropertiesParams = {},
): Promise<PropertyListResponse> {
  return getJson('/properties', propertyListResponseSchema, {
    ...(params.search ? { search: params.search } : {}),
    ...(params.status ? { status: params.status } : {}),
    ...(params.page ? { page: params.page } : {}),
    ...(params.pageSize ? { pageSize: params.pageSize } : {}),
    ...(params.sort ? { sort: params.sort } : {}),
  })
}

export async function getProperty(id: string): Promise<PropertyDetail> {
  const { property } = await getJson(`/properties/${id}`, propertyResponseSchema)
  return property
}

/**
 * El backend rechaza strings vacíos donde espera un campo opcional, así que se
 * omiten en vez de mandarlos. Las características viajan como array.
 */
function toPayload(form: PropertyForm) {
  const texto = (key: string, value?: string) =>
    value && value.trim() ? { [key]: value.trim() } : {}
  const numero = (key: string, value?: number) =>
    value !== undefined && !Number.isNaN(value) ? { [key]: value } : {}

  const features = (form.features ?? '')
    .split(',')
    .map((f) => f.trim())
    .filter(Boolean)

  return {
    title: form.title,
    propertyType: form.propertyType,
    operationType: form.operationType,
    price: form.price,
    currency: form.currency,
    ...texto('description', form.description),
    ...texto('address', form.address),
    ...texto('city', form.city),
    ...texto('state', form.state),
    ...numero('areaM2', form.areaM2),
    ...numero('rooms', form.rooms),
    ...numero('bathrooms', form.bathrooms),
    ...numero('parking', form.parking),
    ...numero('floor', form.floor),
    ...numero('yearBuilt', form.yearBuilt),
    ...(features.length > 0 ? { features } : {}),
  }
}

export async function createProperty(form: PropertyForm): Promise<PropertyDetail> {
  const { property } = await postJson(
    '/properties',
    propertyResponseSchema,
    toPayload(form),
  )
  return property
}

export async function updateProperty(
  id: string,
  form: PropertyForm,
): Promise<PropertyDetail> {
  // En edición siempre se manda `features`, incluso vacío: el backend hace
  // reemplazo completo y omitirlo dejaría las viejas.
  const features = (form.features ?? '')
    .split(',')
    .map((f) => f.trim())
    .filter(Boolean)

  const { property } = await patchJson(`/properties/${id}`, propertyResponseSchema, {
    ...toPayload(form),
    features,
  })
  return property
}

export async function changePropertyStatus(
  id: string,
  status: PropertyStatus,
): Promise<PropertyDetail> {
  const { property } = await patchJson(
    `/properties/${id}/status`,
    propertyResponseSchema,
    { status },
  )
  return property
}

export async function deleteProperty(id: string): Promise<void> {
  await api.delete(`/properties/${id}`)
}
