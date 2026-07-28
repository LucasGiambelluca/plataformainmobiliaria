import { Prisma } from "@prisma/client";
import { prisma } from "@/config/database";
import type {
  AnalyticsRepository,
  PlatformMetrics,
  TenantMetrics,
} from "./analytics.service";

/** Suma de Decimals sin pasar por float: son montos de plata. */
function sumar(valores: (Prisma.Decimal | null)[]): string {
  let total = new Prisma.Decimal(0);
  for (const valor of valores) {
    total = total.plus(valor ?? 0);
  }
  return total.toFixed(2);
}

/** Primer día del mes, N meses atrás. */
function inicioDeMes(mesesAtras: number): Date {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCMonth(d.getUTCMonth() - mesesAtras);
  return d;
}

const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

export const analyticsRepository: AnalyticsRepository = {
  async platform(): Promise<PlatformMetrics> {
    const desde6Meses = inicioDeMes(5);

    const [
      tenantsTotal,
      tenantsActive,
      subsPorEstado,
      activas,
      pagos6Meses,
      propsTotal,
      propsPublicadas,
      consultas30,
      topAgencies,
    ] = await Promise.all([
      prisma.tenant.count(),
      prisma.tenant.count({ where: { isActive: true } }),
      prisma.subscription.groupBy({ by: ["status"], _count: { _all: true } }),
      // MRR: los planes de las suscripciones que hoy están activas.
      prisma.subscription.findMany({
        where: { status: "active" },
        select: { plan: { select: { priceAmount: true } } },
      }),
      prisma.payment.findMany({
        where: { status: "paid", paidAt: { gte: desde6Meses } },
        select: { amount: true, paidAt: true },
      }),
      prisma.property.count(),
      prisma.property.count({ where: { status: { in: ["published", "featured"] } } }),
      prisma.inquiry.count({
        where: { createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
      }),
      prisma.tenant.findMany({
        where: { isActive: true },
        orderBy: { properties: { _count: "desc" } },
        take: 5,
        select: { id: true, name: true, slug: true, _count: { select: { properties: true } } },
      }),
    ]);

    const porEstado = (estado: string) =>
      subsPorEstado.find((s) => s.status === estado)?._count._all ?? 0;

    // Serie mensual: se arman los 6 baldes y se reparten los pagos.
    const baldes = Array.from({ length: 6 }, (_, i) => {
      const fecha = inicioDeMes(5 - i);
      return {
        clave: `${fecha.getUTCFullYear()}-${fecha.getUTCMonth()}`,
        month: MESES[fecha.getUTCMonth()],
        total: new Prisma.Decimal(0),
      };
    });

    for (const pago of pagos6Meses) {
      if (!pago.paidAt) continue;
      const clave = `${pago.paidAt.getUTCFullYear()}-${pago.paidAt.getUTCMonth()}`;
      const balde = baldes.find((b) => b.clave === clave);
      if (balde) balde.total = balde.total.plus(pago.amount);
    }

    return {
      tenants: {
        total: tenantsTotal,
        active: tenantsActive,
        suspended: tenantsTotal - tenantsActive,
      },
      subscriptions: {
        active: porEstado("active"),
        trialing: porEstado("trialing"),
        pastDue: porEstado("past_due"),
        canceled: porEstado("canceled"),
      },
      mrr: sumar(activas.map((s) => s.plan.priceAmount)),
      revenueLast6Months: sumar(pagos6Meses.map((p) => p.amount)),
      properties: { total: propsTotal, published: propsPublicadas },
      inquiriesLast30Days: consultas30,
      revenueSeries: baldes.map((b) => ({ month: b.month, amount: b.total.toFixed(2) })),
      topAgencies: topAgencies.map((t) => ({
        id: t.id,
        name: t.name,
        slug: t.slug,
        properties: t._count.properties,
      })),
    };
  },

  async tenant(tenantId: string): Promise<TenantMetrics> {
    const hace30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [porEstado, vistas, consultasTotal, consultasNuevas, consultas30, top] =
      await Promise.all([
        prisma.property.groupBy({
          by: ["status"],
          where: { tenantId },
          _count: { _all: true },
        }),
        prisma.property.aggregate({ where: { tenantId }, _sum: { viewsCount: true } }),
        prisma.inquiry.count({ where: { tenantId } }),
        prisma.inquiry.count({ where: { tenantId, status: "new" } }),
        prisma.inquiry.count({ where: { tenantId, createdAt: { gte: hace30 } } }),
        prisma.property.findMany({
          where: { tenantId },
          orderBy: { viewsCount: "desc" },
          take: 5,
          select: { id: true, title: true, viewsCount: true },
        }),
      ]);

    const cuenta = (estado: string) =>
      porEstado.find((p) => p.status === estado)?._count._all ?? 0;

    return {
      properties: {
        total: porEstado.reduce((acc, p) => acc + p._count._all, 0),
        published: cuenta("published"),
        draft: cuenta("draft"),
        featured: cuenta("featured"),
      },
      viewsTotal: vistas._sum.viewsCount ?? 0,
      inquiries: {
        total: consultasTotal,
        new: consultasNuevas,
        last30Days: consultas30,
      },
      topProperties: top,
    };
  },
};
