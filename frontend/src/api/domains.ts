import { api, getJson, postJson } from '../lib/api'
import {
  adminDomainListResponseSchema,
  domainListResponseSchema,
  domainResponseSchema,
  domainVerifyResponseSchema,
  type AdminDomainListResponse,
  type CustomDomain,
  type DomainStatus,
  type DomainVerifyResult,
} from './schemas'

/* ----------------------- dominios de la inmobiliaria ----------------------- */

export interface DomainsOverview {
  domains: CustomDomain[]
  /** Valor exacto que el usuario tiene que cargar en su proveedor de DNS. */
  dnsTarget: string
}

export function listDomains(): Promise<DomainsOverview> {
  return getJson('/domains', domainListResponseSchema)
}

export async function addDomain(domain: string): Promise<CustomDomain> {
  const res = await postJson('/domains', domainResponseSchema, { domain })
  return res.domain
}

/**
 * Dispara el chequeo DNS. El estado que devuelve es el real: `active` significa
 * que el dominio ya apunta acá, no que se haya aceptado el pedido.
 */
export function verifyDomain(id: string): Promise<DomainVerifyResult> {
  return postJson(`/domains/${id}/verify`, domainVerifyResponseSchema)
}

export async function deleteDomain(id: string): Promise<void> {
  await api.delete(`/domains/${id}`)
}

/* --------------------------- vista del super admin --------------------------- */

export interface ListAllDomainsParams {
  status?: DomainStatus
  tenantId?: string
  search?: string
  page?: number
  pageSize?: number
}

export function listAllDomains(
  params: ListAllDomainsParams = {},
): Promise<AdminDomainListResponse> {
  return getJson('/admin/domains', adminDomainListResponseSchema, {
    ...(params.status ? { status: params.status } : {}),
    ...(params.tenantId ? { tenantId: params.tenantId } : {}),
    ...(params.search ? { search: params.search } : {}),
    ...(params.page ? { page: params.page } : {}),
    ...(params.pageSize ? { pageSize: params.pageSize } : {}),
  })
}

export function verifyAnyDomain(id: string): Promise<DomainVerifyResult> {
  return postJson(`/admin/domains/${id}/verify`, domainVerifyResponseSchema)
}

export async function deleteAnyDomain(id: string): Promise<void> {
  await api.delete(`/admin/domains/${id}`)
}
