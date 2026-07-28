import type { PaymentStatus, SubscriptionStatus } from "@prisma/client";
import { prisma } from "@/config/database";
import { env } from "@/config/env";
import type { BillingRepository, SubscriptionForCheckout } from "./billing.service";

const subscriptionSelect = {
  id: true,
  tenantId: true,
  externalRef: true,
  plan: {
    select: { id: true, name: true, priceAmount: true, priceCurrency: true },
  },
} as const;

type Row = {
  id: string;
  tenantId: string;
  externalRef: string | null;
  plan: { id: string; name: string; priceAmount: unknown; priceCurrency: string };
};

// Decimal de Prisma → string: la plata nunca viaja como float.
const toSubscription = (row: Row): SubscriptionForCheckout => ({
  ...row,
  plan: { ...row.plan, priceAmount: String(row.plan.priceAmount) },
});

export const billingRepository: BillingRepository = {
  async findSubscription(tenantId: string) {
    const row = await prisma.subscription.findFirst({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      select: subscriptionSelect,
    });
    return row ? toSubscription(row) : null;
  },

  async findPlan(planId: string) {
    const plan = await prisma.plan.findUnique({
      where: { id: planId },
      select: {
        id: true,
        name: true,
        priceAmount: true,
        priceCurrency: true,
        isActive: true,
      },
    });
    return plan ? { ...plan, priceAmount: String(plan.priceAmount) } : null;
  },

  async findBillingEmail(tenantId: string) {
    // El admin de la inmobiliaria es quien autoriza el débito. Si hay varios,
    // el más antiguo: es el que se creó al provisionar el tenant.
    const admin = await prisma.user.findFirst({
      where: { tenantId, role: "tenant_admin", isActive: true },
      orderBy: { createdAt: "asc" },
      select: { email: true },
    });
    if (admin) return admin.email;

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { contactEmail: true },
    });
    return tenant?.contactEmail ?? null;
  },

  async setPendingPlan(subscriptionId, pendingPlanId, externalRef) {
    // Ojo: NO se toca planId. El tenant sigue con el plan que paga hasta que
    // la pasarela confirme el nuevo.
    await prisma.subscription.update({
      where: { id: subscriptionId },
      data: { pendingPlanId, externalRef },
    });
  },

  async applyPendingPlan(subscriptionId: string) {
    const sub = await prisma.subscription.findUnique({
      where: { id: subscriptionId },
      select: { pendingPlanId: true },
    });
    if (!sub?.pendingPlanId) return;

    await prisma.subscription.update({
      where: { id: subscriptionId },
      data: { planId: sub.pendingPlanId, pendingPlanId: null },
    });
  },

  async clearPendingPlan(subscriptionId: string) {
    await prisma.subscription.update({
      where: { id: subscriptionId },
      data: { pendingPlanId: null },
    });
  },

  async findSubscriptionById(id: string) {
    const row = await prisma.subscription.findUnique({
      where: { id },
      select: subscriptionSelect,
    });
    return row ? toSubscription(row) : null;
  },

  async findSubscriptionByExternalRef(externalRef: string) {
    const row = await prisma.subscription.findFirst({
      where: { externalRef },
      select: subscriptionSelect,
    });
    return row ? toSubscription(row) : null;
  },

  async updateSubscriptionStatus(
    id: string,
    status: SubscriptionStatus,
    periodEnd: Date | null,
  ) {
    await prisma.subscription.update({
      where: { id },
      data: {
        status,
        ...(periodEnd
          ? { currentPeriodStart: new Date(), currentPeriodEnd: periodEnd }
          : {}),
        // Un pago aprobado revierte una baja programada.
        ...(status === "active" ? { cancelAtPeriodEnd: false } : {}),
      },
    });
  },

  async upsertPayment(data: {
    subscriptionId: string;
    tenantId: string;
    amount: string;
    currency: string;
    status: PaymentStatus;
    externalPaymentId: string;
    paidAt: Date | null;
  }) {
    // Los webhooks se reintentan: sin esta búsqueda previa, el mismo pago se
    // registraría varias veces y los reportes de ingresos quedarían inflados.
    const existente = await prisma.payment.findFirst({
      where: { externalPaymentId: data.externalPaymentId },
      select: { id: true },
    });

    if (existente) {
      await prisma.payment.update({
        where: { id: existente.id },
        data: { status: data.status, paidAt: data.paidAt },
      });
      return;
    }

    await prisma.payment.create({
      data: {
        subscriptionId: data.subscriptionId,
        tenantId: data.tenantId,
        amount: data.amount,
        currency: data.currency,
        status: data.status,
        provider: env.PAYMENT_PROVIDER === "stripe" ? "stripe" : "mercadopago",
        externalPaymentId: data.externalPaymentId,
        paidAt: data.paidAt,
      },
    });
  },
};
