/**
 * Métricas de los dos paneles.
 *
 * Todo monto viaja como string decimal: son montos de dinero y un float
 * acumulado sobre miles de pagos deriva.
 */

export interface PlatformMetrics {
  tenants: { total: number; active: number; suspended: number };
  subscriptions: { active: number; trialing: number; pastDue: number; canceled: number };
  /** Ingreso recurrente mensual: suma de los planes de suscripciones activas. */
  mrr: string;
  /** Cobrado de verdad en los últimos 6 meses. */
  revenueLast6Months: string;
  properties: { total: number; published: number };
  inquiriesLast30Days: number;
  /** Serie mensual de cobros, del más viejo al más nuevo. */
  revenueSeries: { month: string; amount: string }[];
  topAgencies: { id: string; name: string; slug: string; properties: number }[];
}

export interface TenantMetrics {
  properties: { total: number; published: number; draft: number; featured: number };
  viewsTotal: number;
  inquiries: { total: number; new: number; last30Days: number };
  /** Publicaciones con más vistas de esta inmobiliaria. */
  topProperties: { id: string; title: string; viewsCount: number }[];
}

export interface AnalyticsRepository {
  platform(): Promise<PlatformMetrics>;
  tenant(tenantId: string): Promise<TenantMetrics>;
}

export class AnalyticsService {
  constructor(private readonly repo: AnalyticsRepository) {}

  platform(): Promise<PlatformMetrics> {
    return this.repo.platform();
  }

  tenant(tenantId: string): Promise<TenantMetrics> {
    return this.repo.tenant(tenantId);
  }
}
