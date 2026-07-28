import { getJson, patchJson, postJson } from '../lib/api'
import {
  inquiryCreatedSchema,
  inquiryListResponseSchema,
  inquiryResponseSchema,
  type ContactForm,
  type Inquiry,
  type InquiryListResponse,
  type InquiryStatus,
} from './schemas'

/**
 * Consulta desde la ficha pública. No manda tenantId ni propertyId en el
 * cuerpo: el backend deduce la inmobiliaria de la propiedad de la ruta.
 */
export async function sendInquiry(propertyId: string, form: ContactForm): Promise<void> {
  await postJson(
    `/public/properties/${propertyId}/inquiries`,
    inquiryCreatedSchema,
    {
      name: form.name,
      email: form.email,
      message: form.message,
      ...(form.phone ? { phone: form.phone } : {}),
      ...(form.website ? { website: form.website } : {}),
    },
  )
}

export interface ListInquiriesParams {
  status?: InquiryStatus
  propertyId?: string
  search?: string
  page?: number
  pageSize?: number
}

export function listInquiries(
  params: ListInquiriesParams = {},
): Promise<InquiryListResponse> {
  return getJson('/inquiries', inquiryListResponseSchema, {
    ...(params.status ? { status: params.status } : {}),
    ...(params.propertyId ? { propertyId: params.propertyId } : {}),
    ...(params.search ? { search: params.search } : {}),
    ...(params.page ? { page: params.page } : {}),
    ...(params.pageSize ? { pageSize: params.pageSize } : {}),
  })
}

export async function setInquiryStatus(
  id: string,
  status: InquiryStatus,
): Promise<Inquiry> {
  const { inquiry } = await patchJson(`/inquiries/${id}`, inquiryResponseSchema, {
    status,
  })
  return inquiry
}
