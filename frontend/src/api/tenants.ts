import { getJson, patchJson, postJson } from '../lib/api'
import {
  impersonationResponseSchema,
  tenantListResponseSchema,
  tenantProvisionResponseSchema,
  tenantUpdateResponseSchema,
  type ImpersonationResponse,
  type NewTenantForm,
  type TenantListResponse,
} from './schemas'

export interface ListTenantsParams {
  search?: string
  isActive?: boolean
  page?: number
  pageSize?: number
}

export function listTenants(params: ListTenantsParams = {}): Promise<TenantListResponse> {
  return getJson('/admin/tenants', tenantListResponseSchema, {
    // El backend espera "true"/"false" como string en la query.
    ...(params.search ? { search: params.search } : {}),
    ...(params.isActive !== undefined ? { isActive: String(params.isActive) } : {}),
    ...(params.page ? { page: params.page } : {}),
    ...(params.pageSize ? { pageSize: params.pageSize } : {}),
  })
}

/** Alta de inmobiliaria por el super admin (crea tenant + admin + suscripción). */
export function createTenant(form: NewTenantForm) {
  return postJson('/admin/tenants', tenantProvisionResponseSchema, {
    tenantName: form.name,
    slug: form.slug,
    adminEmail: form.adminEmail,
    adminPassword: form.adminPassword,
    ...(form.adminName ? { adminName: form.adminName } : {}),
  })
}

export interface UpdateTenantInput {
  name?: string
  isActive?: boolean
  planId?: string
}

export function updateTenant(id: string, data: UpdateTenantInput) {
  return patchJson(`/admin/tenants/${id}`, tenantUpdateResponseSchema, data)
}

/** Abre una sesión de soporte de solo lectura sobre la inmobiliaria. */
export function impersonateTenant(id: string): Promise<ImpersonationResponse> {
  return postJson(`/admin/tenants/${id}/impersonate`, impersonationResponseSchema)
}
