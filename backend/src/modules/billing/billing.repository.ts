import { Prisma, type PaymentStatus, type SubscriptionStatus } from "@prisma/client";
import { prisma } from "@/config/database";
import { env } from "@/config/env";
import type { BillingRepository, SubscriptionForCheckout } from "./billing.service";

/**
 * Cliente transaccional. Cada método de escritura acepta uno opcional: sin él
 * se usa el `prisma` global, y con él todas las escrituras de una unidad de
 * trabajo caen en la misma transacción.
 */
type Tx = Prisma.TransactionClient;
const cliente = (tx?: Tx) => tx ?? prisma;

const subscriptionSelect = {
  id: true,
  tenantId: true,
  status: true,
  currentPeriodEnd: true,
  externalRef: true,
  pendingExternalRef: true,
  plan: {
    select: { id: true, name: true, priceAmount: true, priceCurrency: true },
  },
} as const;

type Row = {
  id: string;
  tenantId: string;
  status: SubscriptionStatus;
  currentPeriodEnd: Date | null;
  externalRef: string | null;
  pendingExternalRef: string | null;
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

  /**
   * Corre una unidad de trabajo dentro de una transacción. Si algo tira, no
   * queda nada escrito: o se aplican las cuatro escrituras del webhook, o
   * ninguna.
   */
  enTransaccion<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return prisma.$transaction(fn, { timeout: 10_000, maxWait: 5_000 });
  },

  async setPendingPlan(subscriptionId, pendingPlanId, pendingExternalRef) {
    // Ojo: NO se tocan planId ni externalRef. El tenant sigue con el plan y el
    // débito que paga hasta que la pasarela confirme el nuevo.
    await prisma.subscription.update({
      where: { id: subscriptionId },
      data: { pendingPlanId, pendingExternalRef },
    });
  },

  async applyPendingPlan(subscriptionId: string, tx?: Tx) {
    const db = cliente(tx);
    const sub = await db.subscription.findUnique({
      where: { id: subscriptionId },
      select: { pendingPlanId: true, pendingExternalRef: true },
    });
    if (!sub?.pendingPlanId) return;

    // El débito del plan nuevo pasa a ser el vigente. Cancelar el anterior en
    // la pasarela lo hace el servicio, después del commit.
    await db.subscription.update({
      where: { id: subscriptionId },
      data: {
        planId: sub.pendingPlanId,
        pendingPlanId: null,
        ...(sub.pendingExternalRef
          ? { externalRef: sub.pendingExternalRef, pendingExternalRef: null }
          : {}),
      },
    });
  },

  async clearPendingPlan(subscriptionId: string, tx?: Tx) {
    await cliente(tx).subscription.update({
      where: { id: subscriptionId },
      data: { pendingPlanId: null, pendingExternalRef: null },
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
      where: { OR: [{ externalRef }, { pendingExternalRef: externalRef }] },
      select: subscriptionSelect,
    });
    return row ? toSubscription(row) : null;
  },

  async updateSubscriptionStatus(
    id: string,
    status: SubscriptionStatus,
    periodEnd: Date | null,
    tx?: Tx,
  ) {
    await cliente(tx).subscription.update({
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

  async upsertPayment(
    data: {
      subscriptionId: string;
      tenantId: string;
      amount: string;
      currency: string;
      status: PaymentStatus;
      externalPaymentId: string;
      paidAt: Date | null;
    },
    tx?: Tx,
  ) {
    const db = cliente(tx);

    // `createMany` con `skipDuplicates` es `INSERT ... ON CONFLICT DO NOTHING`.
    // Es la forma correcta acá por dos razones, y la segunda es la que obliga:
    //
    //  1. Cierra la carrera sin necesitar un try/catch. La restricción única de
    //     `external_payment_id` es la que decide cuál de las dos entregas
    //     concurrentes gana, y la otra no inserta.
    //  2. NO tira error cuando hay conflicto, y eso es obligatorio: dentro de
    //     una transacción, cualquier error la deja abortada en PostgreSQL y no
    //     se puede seguir consultando. El try/catch sobre un `create` que da
    //     P2002 — que es como se resolvía antes— funciona fuera de una
    //     transacción y es inservible adentro. Por eso el insert va por acá y
    //     el caso de "ya existía" se resuelve leyendo.
    const { count } = await db.payment.createMany({
      data: [
        {
          subscriptionId: data.subscriptionId,
          tenantId: data.tenantId,
          amount: data.amount,
          currency: data.currency,
          status: data.status,
          provider: env.PAYMENT_PROVIDER === "stripe" ? "stripe" : "mercadopago",
          externalPaymentId: data.externalPaymentId,
          paidAt: data.paidAt,
        },
      ],
      skipDuplicates: true,
    });

    if (count === 1) return { created: true, changed: true };

    // No se insertó porque ya estaba: es una reentrega (o el duplicado que ganó
    // la carrera). Se relee el estado real para decidir si esto aportó algo.
    //
    // El webhook puede llegar primero como `pending` y después como `approved`,
    // y en ese caso el pago sí cambió de estado y hay que notificarlo.
    const actual = await db.payment.findFirst({
      where: { externalPaymentId: data.externalPaymentId },
      select: { id: true, status: true },
    });
    // Si el insert no entró y tampoco está el registro, el conflicto vino de
    // otro índice y lo de abajo escribiría datos de un pago inexistente.
    if (!actual) throw new Error(`Pago ${data.externalPaymentId} en un estado inconsistente`);

    const changed = actual.status !== data.status;
    if (changed) {
      await db.payment.update({
        where: { id: actual.id },
        data: { status: data.status, paidAt: data.paidAt },
      });
    }
    return { created: false, changed };
  },
};
