import type { PaymentStatus, SubscriptionStatus } from "@prisma/client";
import { BadRequestError, NotFoundError } from "@/shared/errors";
import { logger } from "@/config/logger";
import type { PaymentEvent, PaymentProvider } from "@/shared/services/payments";

export interface SubscriptionForCheckout {
  id: string;
  tenantId: string;
  externalRef: string | null;
  plan: { id: string; name: string; priceAmount: string; priceCurrency: string };
}

export interface BillingRepository {
  findSubscription(tenantId: string): Promise<SubscriptionForCheckout | null>;
  findPlan(
    planId: string,
  ): Promise<{ id: string; name: string; priceAmount: string; priceCurrency: string; isActive: boolean } | null>;
  /** Email al que la pasarela le va a cobrar: el admin de la inmobiliaria. */
  findBillingEmail(tenantId: string): Promise<string | null>;
  /**
   * Deja anotado el plan que se intenta contratar SIN aplicarlo. Se aplica
   * recién al confirmar el pago.
   */
  setPendingPlan(
    subscriptionId: string,
    pendingPlanId: string,
    externalRef: string,
  ): Promise<void>;
  /** Aplica el plan pendiente y lo limpia. Sin pendiente, no hace nada. */
  applyPendingPlan(subscriptionId: string): Promise<void>;
  clearPendingPlan(subscriptionId: string): Promise<void>;
  findSubscriptionById(id: string): Promise<SubscriptionForCheckout | null>;
  findSubscriptionByExternalRef(externalRef: string): Promise<SubscriptionForCheckout | null>;
  updateSubscriptionStatus(
    id: string,
    status: SubscriptionStatus,
    periodEnd: Date | null,
  ): Promise<void>;
  /** Idempotente por externalPaymentId: los webhooks se reintentan. */
  upsertPayment(data: {
    subscriptionId: string;
    tenantId: string;
    amount: string;
    currency: string;
    status: PaymentStatus;
    externalPaymentId: string;
    paidAt: Date | null;
  }): Promise<void>;
}

/** Estado del evento → estado de la suscripción. */
const A_SUBSCRIPTION: Record<PaymentEvent["status"], SubscriptionStatus> = {
  approved: "active",
  pending: "past_due",
  rejected: "past_due",
  cancelled: "canceled",
  refunded: "canceled",
};

/** Estado del evento → estado del pago registrado. */
const A_PAYMENT: Record<PaymentEvent["status"], PaymentStatus> = {
  approved: "paid",
  pending: "pending",
  rejected: "failed",
  cancelled: "failed",
  refunded: "refunded",
};

export class BillingService {
  constructor(
    private readonly repo: BillingRepository,
    private readonly provider: PaymentProvider,
    /** A dónde vuelve el usuario después de autorizar el pago. */
    private readonly returnUrl: string,
  ) {}

  /**
   * Arranca el cobro de un plan. Devuelve la URL de la pasarela; el cambio de
   * plan NO se aplica acá — se aplica cuando el webhook confirma el pago. Si
   * se aplicara ahora, alguien podría empezar un checkout, abandonarlo, y
   * quedarse con el plan caro sin pagar.
   */
  async createCheckout(tenantId: string, planId: string) {
    const [subscription, plan, email] = await Promise.all([
      this.repo.findSubscription(tenantId),
      this.repo.findPlan(planId),
      this.repo.findBillingEmail(tenantId),
    ]);

    if (!subscription) throw new NotFoundError("El tenant no tiene suscripción");
    if (!plan || !plan.isActive) throw new NotFoundError("Plan no encontrado");
    if (!email) throw new BadRequestError("La inmobiliaria no tiene un email de facturación");

    if (Number(plan.priceAmount) === 0) {
      throw new BadRequestError("El plan gratuito no requiere pago");
    }
    if (plan.id === subscription.plan.id) {
      throw new BadRequestError("Ya estás suscripto a ese plan");
    }

    const checkout = await this.provider.createSubscriptionCheckout({
      reference: subscription.id,
      planName: plan.name,
      amount: plan.priceAmount,
      currency: plan.priceCurrency,
      payerEmail: email,
      returnUrl: this.returnUrl,
    });

    // Queda como pendiente, NO como plan vigente: el upgrade se concede recién
    // cuando entra la plata.
    await this.repo.setPendingPlan(
      subscription.id,
      plan.id,
      checkout.externalSubscriptionId,
    );

    return { redirectUrl: checkout.redirectUrl };
  }

  /**
   * Procesa una notificación de la pasarela.
   *
   * Dos reglas que no se negocian: la firma se verifica ANTES de mirar nada, y
   * el estado se consulta al proveedor en vez de creerle al cuerpo del webhook.
   * El cuerpo lo puede escribir cualquiera que conozca la URL.
   */
  async handleWebhook(params: {
    signature: string | undefined;
    requestId: string | undefined;
    topic: string | undefined;
    dataId: string | undefined;
  }): Promise<{ processed: boolean }> {
    const firmaOk = this.provider.verifyWebhook({
      signature: params.signature,
      requestId: params.requestId,
      dataId: params.dataId,
    });
    if (!firmaOk) {
      throw new BadRequestError("Firma de webhook inválida");
    }
    if (!params.topic || !params.dataId) return { processed: false };

    const evento = await this.provider.fetchEvent({
      topic: params.topic,
      id: params.dataId,
    });
    if (!evento) return { processed: false };

    const subscription = await this.resolveSubscription(evento);
    if (!subscription) {
      // Notificación de algo que no es nuestro: se ignora sin romper, o la
      // pasarela la reintenta para siempre.
      logger.warn({ topic: params.topic, dataId: params.dataId }, "Webhook sin suscripción asociada");
      return { processed: false };
    }

    if (evento.externalPaymentId) {
      await this.repo.upsertPayment({
        subscriptionId: subscription.id,
        tenantId: subscription.tenantId,
        amount: evento.amount ?? subscription.plan.priceAmount,
        currency: evento.currency ?? subscription.plan.priceCurrency,
        status: A_PAYMENT[evento.status],
        externalPaymentId: evento.externalPaymentId,
        paidAt: evento.paidAt,
      });
    }

    const nuevoEstado = A_SUBSCRIPTION[evento.status];
    // El período se extiende un mes desde el pago aprobado.
    const periodEnd =
      evento.status === "approved"
        ? new Date((evento.paidAt ?? new Date()).getTime() + 30 * 24 * 60 * 60 * 1000)
        : null;

    await this.repo.updateSubscriptionStatus(subscription.id, nuevoEstado, periodEnd);

    // El upgrade se concede acá y en ningún otro lado.
    if (evento.status === "approved") {
      await this.repo.applyPendingPlan(subscription.id);
    } else if (evento.status === "rejected" || evento.status === "cancelled") {
      // El pago no prosperó: se descarta el plan pretendido para que no quede
      // esperando y se aplique con un pago posterior por otra cosa.
      await this.repo.clearPendingPlan(subscription.id);
    }

    return { processed: true };
  }

  /** Cancela en la pasarela, si hay una suscripción externa viva. */
  async cancelExternal(tenantId: string): Promise<void> {
    const subscription = await this.repo.findSubscription(tenantId);
    if (!subscription?.externalRef) return;

    await this.provider.cancelSubscription(subscription.externalRef);
  }

  private async resolveSubscription(
    evento: PaymentEvent,
  ): Promise<SubscriptionForCheckout | null> {
    // external_reference es nuestra subscription.id: es la vía directa.
    if (evento.externalReference) {
      const porRef = await this.repo.findSubscriptionById(evento.externalReference);
      if (porRef) return porRef;
    }
    if (evento.externalSubscriptionId) {
      return this.repo.findSubscriptionByExternalRef(evento.externalSubscriptionId);
    }
    return null;
  }
}
