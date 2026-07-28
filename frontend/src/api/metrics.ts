import { getJson } from '../lib/api'
import {
  auditActionsResponseSchema,
  auditListResponseSchema,
  platformMetricsResponseSchema,
  tenantMetricsResponseSchema,
  type AuditListResponse,
  type PlatformMetrics,
  type TenantMetrics,
} from './schemas'

/** Métricas globales de la plataforma. Solo super admin. */
export async function getPlatformMetrics(): Promise<PlatformMetrics> {
  const { metrics } = await getJson('/admin/metrics', platformMetricsResponseSchema)
  return metrics
}

/** Métricas de la propia inmobiliaria; el tenant sale del token. */
export async function getTenantMetrics(): Promise<TenantMetrics> {
  const { metrics } = await getJson('/metrics', tenantMetricsResponseSchema)
  return metrics
}

export interface AuditParams {
  action?: string
  page?: number
  pageSize?: number
}

export function getAuditLog(params: AuditParams = {}): Promise<AuditListResponse> {
  return getJson('/admin/audit', auditListResponseSchema, {
    ...(params.action ? { action: params.action } : {}),
    ...(params.page ? { page: params.page } : {}),
    ...(params.pageSize ? { pageSize: params.pageSize } : {}),
  })
}

export async function getAuditActions(): Promise<string[]> {
  const { actions } = await getJson('/admin/audit/actions', auditActionsResponseSchema)
  return actions
}
