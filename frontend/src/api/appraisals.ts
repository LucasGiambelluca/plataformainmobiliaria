import { getJson, patchJson, postJson } from '../lib/api'
import {
  appraisalCreatedResponseSchema,
  appraisalListResponseSchema,
  appraisalParticipantsResponseSchema,
  appraisalResponseSchema,
  appraisalUploadUrlResponseSchema,
  type Appraisal,
  type AppraisalAgency,
  type AppraisalCreated,
  type AppraisalListResponse,
  type AppraisalStatus,
  type AppraisalUploadUrl,
} from './schemas'

/* --------------------------- lado del propietario --------------------------- */

/**
 * Inmobiliarias que prestan el servicio. Con `city`, solo las que operan ahí.
 *
 * Sin sesión: es la lista que el visitante ve antes de elegir.
 */
export async function listAppraisalParticipants(
  city?: string,
): Promise<AppraisalAgency[]> {
  const res = await getJson(
    '/public/appraisals/participants',
    appraisalParticipantsResponseSchema,
    city ? { city } : {},
  )
  return res.agencies
}

export interface CreateAppraisalInput {
  name: string
  phone: string
  email: string
  city: string
  neighborhood?: string
  address: string
  propertyType: string
  purpose: string
  areaM2?: number
  rooms?: number
  bathrooms?: number
  condition?: string
  comments?: string
  details?: Record<string, unknown>
  tenantId?: string
  draftId?: string
  declaredAccurate: true
  acceptedTerms: true
}

export function createAppraisal(
  input: CreateAppraisalInput,
): Promise<AppraisalCreated> {
  return postJson('/public/appraisals', appraisalCreatedResponseSchema, input)
}

/**
 * Firma la subida de una foto y devuelve el draft al que quedó asociada.
 *
 * El draft lo emite el servidor y hay que devolvérselo tanto al confirmar cada
 * foto como al mandar el formulario: es lo que las une a la solicitud.
 */
export function createAppraisalUploadUrl(input: {
  draftId?: string
  contentType: string
  sizeBytes: number
}): Promise<AppraisalUploadUrl> {
  return postJson(
    '/public/appraisals/upload-url',
    appraisalUploadUrlResponseSchema,
    input,
  )
}

export function confirmAppraisalMedia(
  mediaId: string,
  draftId: string,
): Promise<{ ok: boolean }> {
  return postJson(
    `/public/appraisals/media/${mediaId}/confirm`,
    appraisalCreatedResponseSchema.pick({ ok: true }),
    { draftId },
  )
}

/* -------------------------- lado de la inmobiliaria -------------------------- */

export interface ListAppraisalsParams {
  status?: AppraisalStatus
  page?: number
  pageSize?: number
}

export function listMyAppraisals(
  params: ListAppraisalsParams = {},
): Promise<AppraisalListResponse> {
  return getJson('/appraisals', appraisalListResponseSchema, {
    ...(params.status ? { status: params.status } : {}),
    ...(params.page ? { page: params.page } : {}),
    ...(params.pageSize ? { pageSize: params.pageSize } : {}),
  })
}

export async function updateAppraisalStatus(
  id: string,
  status: Exclude<AppraisalStatus, 'unassigned'>,
): Promise<Appraisal> {
  const res = await patchJson(`/appraisals/${id}`, appraisalResponseSchema, { status })
  return res.appraisal
}
