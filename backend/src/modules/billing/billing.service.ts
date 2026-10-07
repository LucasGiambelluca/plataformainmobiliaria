import type { PaymentStatus, SubscriptionStatus } from "@prisma/client";
import { BadRequestError, NotFoundError } from "@/shared/errors";
import { logger } from "@/config/logger";
import type {
  PaymentEvent,
  PaymentProvider,
  PaymentProviderResolver,
} from "@/shared/services/payments";
import { estaAlDia } from "@/modules/subscriptions/vigencia";
import { noopNotifier, type Notifier } from "@/modules/notifications";
import { noopAuditor, type Auditor } from "@/modules/audit/audit.service";

export interface SubscriptionForCheckout {
  id: string;
  tenantId: string;
  status: SubscriptionStatus;
  currentPeriodEnd: Date | null;
  /** Débito automático vigente en la pasarela. */
  externalRef: string | null;
  /** Débito del checkout abierto y todavía no pagado. */
  pendingExternalRef: string | null;
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
   * Deja anotado el plan que se intenta contratar y su débito SIN aplicarlos.
   * No toca `externalRef`: el débito vigente sigue siendo el vigente hasta que
   * el nuevo cobre.
   */
  setPendingPlan(
    subscriptionId: string,
    pendingPlanId: string,
    pendingExternalRef: string,
  ): Promise<void>;
  /**
   * Aplica el plan pendiente y promueve su débito a vigente. Sin pendiente, no
   * hace nada.
   */
  applyPendingPlan(subscriptionId: string, tx?: unknown): Promise<void>;
  /** Descarta el plan pendiente y su débito. */
  clearPendingPlan(subscriptionId: string, tx?: unknown): Promise<void>;
  findSubscriptionById(id: string): Promise<SubscriptionForCheckout | null>;
  /** Busca por el débito vigente o por el pendiente. */
  findSubscriptionByExternalRef(externalRef: string): Promise<SubscriptionForCheckout | null>;
  updateSubscriptionStatus(
    id: string,
    status: SubscriptionStatus,
    periodEnd: Date | null,
    tx?: unknown,
  ): Promise<void>;
  /**
   * Registra el pago, idempotente por `externalPaymentId`.
   *
   * Devuelve si esta entrega aporta algo: `created` para la primera, `changed`
   * cuando el pago pasó a un estado que no tenía. Con eso el servicio decide si
   * notificar y auditar, porque un webhook reintentado no puede hacer sonar dos
   * veces el mismo cobro.
   */
  upsertPayment(
    data: {
      subscriptionId: string;
      tenantId: string;
      amount: string;
      currency: string;
      status: PaymentStatus;
      externalPaymentId: string;
      paidAt: Date | null;
    },
    tx?: unknown,
  ): Promise<{ created: boolean; changed: boolean }>;
  /**
   * Corre una unidad de trabajo en una transacción. Las cuatro escrituras del
   * webhook van adentro: o se aplican todas, o ninguna. Ver A1 de AUDITORIA.md
   * — sin esto, un corte entre el segundo y el tercer write deja a la
   * inmobiliaria pagando un plan que no se le aplica.
   *
   * `tx` es opaco acá a propósito: la interfaz no depende de Prisma, y el
   * repositorio es el único que sabe de clientes transaccionales.
   */
  enTransaccion<T>(fn: (tx: unknown) => Promise<T>): Promise<T>;
}

/**
 * A qué débito automático pertenece un evento, comparado con lo que tenemos
 * anotado. Es lo que decide qué se le hace a la suscripción:
 *
 * - `vigente`: el débito que hoy paga el plan.
 * - `pendiente`: el del checkout abierto; su primer pago aprobado concede el plan.
 * - `reemplazado`: uno nuestro (vuelve con nuestro external_reference) que ya no
 *   es ninguno de los dos — un plan anterior o un checkout abandonado. No debe
 *   seguir debitando.
 * - `sin_dato`: el evento no dice de qué débito viene (algunos `payment`). Se
 *   trata como el vigente, salvo para conceder planes.
 */
type Origen = "vigente" | "pendiente" | "reemplazado" | "sin_dato";

const MS_POR_PERIODO = 30 * 24 * 60 * 60 * 1000;

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
    /**
     * Resolver y no instancia: las credenciales viven en base y se leen por
     * operación. No se puede esconder esa lectura detrás de un proxy porque
     * verifyWebhook es síncrono en la interfaz, y esa firma no se toca: es el
     * control de seguridad más importante del módulo.
     */
    private readonly resolveProvider: PaymentProviderResolver,
    /** A dónde vuelve el usuario después de autorizar el pago. */
    private readonly returnUrl: string,
    private readonly notifier: Notifier = noopNotifier,
    private readonly auditor: Auditor = noopAuditor,
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
    // El mismo plan se puede volver a contratar si se cayó el débito: es la
    // única forma de reactivarlo después de un rechazo o una cancelación (H2).
    if (
      plan.id === subscription.plan.id &&
      subscription.status === "active" &&
      estaAlDia(subscription)
    ) {
      throw new BadRequestError("Ya estás suscripto a ese plan");
    }

    const provider = await this.resolveProvider();
    const checkout = await provider.createSubscriptionCheckout({
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

    // Un checkout anterior que nunca se pagó queda sin dueño: si después el
    // cliente lo autorizara, debitaría un plan que ya no es el que pidió.
    if (subscription.pendingExternalRef) {
      await this.cancelarEnPasarela(
        provider,
        subscription.pendingExternalRef,
        "checkout anterior abandonado",
      );
    }

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
    // Un solo resolve para la verificación y la consulta: las dos tienen que
    // hablar con la misma cuenta.
    const provider = await this.resolveProvider();
    const firmaOk = provider.verifyWebhook({
      signature: params.signature,
      requestId: params.requestId,
      dataId: params.dataId,
    });
    if (!firmaOk) {
      throw new BadRequestError("Firma de webhook inválida");
    }
    if (!params.topic || !params.dataId) return { processed: false };

    const evento = await provider.fetchEvent({
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

    const origen = this.origen(subscription, evento.externalSubscriptionId);
    const esPago = evento.externalPaymentId !== null;
    // El período se extiende un mes desde el pago aprobado.
    const periodEnd = new Date((evento.paidAt ?? new Date()).getTime() + MS_POR_PERIODO);

    // Las escrituras van en UNA transacción. El orden importa y por eso lo
    // decide el servicio: el plan que se pagó se aplica acá y en ningún otro
    // lado, y sin la transacción un corte entre escrituras dejaba a la
    // inmobiliaria con el pago registrado y el plan viejo — es decir, pagando
    // por algo que no tenía (A1).
    //
    // La auditoría, la notificación y las cancelaciones en la pasarela quedan
    // AFUERA a propósito: son efectos que no se pueden deshacer. Hacerlos
    // adentro es arriesgarse a avisar o cancelar algo que después rollbackea.
    const { aporte, planAplicado } = await this.repo.enTransaccion(async (tx) => {
      // `aporte` responde "¿esta entrega hizo algo nuevo?". Una reentrega del
      // webhook no puede volver a mandar el correo de pago confirmado.
      let aporte = { created: false, changed: false };
      if (evento.externalPaymentId) {
        // Todo pago se registra, venga del débito que venga: es plata que se
        // movió y tiene que verse en la contabilidad.
        aporte = await this.repo.upsertPayment(
          {
            subscriptionId: subscription.id,
            tenantId: subscription.tenantId,
            amount: evento.amount ?? subscription.plan.priceAmount,
            currency: evento.currency ?? subscription.plan.priceCurrency,
            status: A_PAYMENT[evento.status],
            externalPaymentId: evento.externalPaymentId,
            paidAt: evento.paidAt,
          },
          tx,
        );
      }

      let planAplicado = false;
      // Un débito reemplazado no le cambia nada a la suscripción.
      if (origen === "reemplazado") return { aporte, planAplicado };

      if (esPago) {
        if (evento.status === "approved") {
          await this.repo.updateSubscriptionStatus(subscription.id, "active", periodEnd, tx);
          // El plan nuevo se concede con un PAGO aprobado de su débito, no con
          // la autorización del débito (H1): autorizar no es pagar.
          if (origen === "pendiente") {
            await this.repo.applyPendingPlan(subscription.id, tx);
            planAplicado = true;
          }
        } else if (evento.status === "rejected" && origen === "vigente") {
          await this.repo.updateSubscriptionStatus(subscription.id, "past_due", null, tx);
        }
        // Un rechazo del pendiente no descarta el plan: MercadoPago reintenta el
        // débito, y si lo descartáramos, el cobro que entra en el reintento
        // quedaría como "reemplazado" y se cancelaría un plan ya pagado.
        // Pagos pending, reembolsados o anulados quedan registrados y no le
        // cambian el estado a la suscripción (N2).
      } else if (evento.status === "cancelled") {
        // Ciclo de vida del débito. Solo importa que se corte: autorizado o
        // pendiente no cambian nada, porque lo que mueve la suscripción es la
        // plata (N1, H3).
        if (origen === "pendiente") {
          await this.repo.clearPendingPlan(subscription.id, tx);
        } else if (origen === "vigente") {
          await this.repo.updateSubscriptionStatus(subscription.id, "canceled", null, tx);
        }
      }

      return { aporte, planAplicado };
    });

    // El plan nuevo ya cobró: el débito anterior tiene que dejar de debitar.
    // Sin esto, pasar de Pro a Enterprise dejaba los dos débitos vivos (C2).
    if (
      planAplicado &&
      subscription.externalRef &&
      subscription.externalRef !== evento.externalSubscriptionId
    ) {
      await this.cancelarEnPasarela(provider, subscription.externalRef, "plan anterior reemplazado");
    }
    // Un débito reemplazado que sigue vivo (la cancelación anterior falló, o es
    // un checkout abandonado que el cliente terminó autorizando): se corta acá.
    // Es lo que hace que un fallo de cancelación se arregle solo en el
    // siguiente aviso.
    if (origen === "reemplazado" && evento.status === "approved" && evento.externalSubscriptionId) {
      await this.cancelarEnPasarela(
        provider,
        evento.externalSubscriptionId,
        "débito reemplazado seguía activo",
      );
    }

    // Avisos solo por PAGOS que aportan algo. Los eventos del débito no son
    // plata y no avisan (N1). Un pago de un débito reemplazado se audita pero
    // no se le avisa a la inmobiliaria: el correo nombraría el plan nuevo.
    const nuevo = aporte.created || aporte.changed;
    if (esPago && nuevo && evento.status === "approved") {
      if (origen !== "reemplazado") await this.notificar("pagoConfirmado", subscription, evento);
      await this.auditar("payment.received", subscription, evento);
    } else if (esPago && nuevo && evento.status === "rejected") {
      if (origen !== "reemplazado") await this.notificar("pagoFallido", subscription, evento);
      await this.auditar("payment.failed", subscription, evento);
    } else if (esPago && evento.status === "approved") {
      logger.info(
        { externalPaymentId: evento.externalPaymentId, planAplicado },
        "Webhook repetido de un pago ya acreditado: sin correo ni auditoría",
      );
    }

    return { processed: true };
  }

  /**
   * Cancela en la pasarela el débito vigente y el pendiente, si los hay. Un
   * checkout abierto que se dejara vivo podría autorizarse después de la baja.
   */
  async cancelExternal(tenantId: string): Promise<void> {
    const subscription = await this.repo.findSubscription(tenantId);
    const refs = [subscription?.externalRef, subscription?.pendingExternalRef].filter(
      (r): r is string => Boolean(r),
    );
    if (refs.length === 0) return;

    const provider = await this.resolveProvider();
    for (const ref of refs) await provider.cancelSubscription(ref);
  }

  private origen(
    subscription: SubscriptionForCheckout,
    externalSubscriptionId: string | null,
  ): Origen {
    if (!externalSubscriptionId) return "sin_dato";
    if (externalSubscriptionId === subscription.pendingExternalRef) return "pendiente";
    if (externalSubscriptionId === subscription.externalRef) return "vigente";
    return "reemplazado";
  }

  /**
   * Cancela un débito en la pasarela sin tirar nunca. Desde el webhook corre
   * después del commit: si tirara, la pasarela reintentaría un evento que ya
   * quedó procesado. Si falla, el próximo cobro de ese débito llega como
   * `reemplazado` y se vuelve a intentar.
   */
  private async cancelarEnPasarela(
    provider: PaymentProvider,
    externalSubscriptionId: string,
    motivo: string,
  ): Promise<void> {
    try {
      await provider.cancelSubscription(externalSubscriptionId);
      logger.info({ externalSubscriptionId, motivo }, "Débito automático cancelado en la pasarela");
    } catch (err) {
      logger.error(
        { err, externalSubscriptionId, motivo },
        "No se pudo cancelar un débito automático: puede volver a debitar",
      );
    }
  }

  /** El movimiento de plata queda registrado; el actor es la pasarela, no un usuario. */
  private async auditar(
    action: "payment.received" | "payment.failed",
    subscription: SubscriptionForCheckout,
    evento: PaymentEvent,
  ): Promise<void> {
    await this.auditor.record({
      tenantId: subscription.tenantId,
      userId: null,
      action,
      entityType: "payment",
      entityId: evento.externalPaymentId ?? undefined,
      metadata: { amount: evento.amount, currency: evento.currency },
    });
  }

  private async notificar(
    tipo: "pagoConfirmado" | "pagoFallido",
    subscription: SubscriptionForCheckout,
    evento: PaymentEvent,
  ): Promise<void> {
    const email = await this.repo.findBillingEmail(subscription.tenantId);
    await this.notifier[tipo](email, {
      planName: subscription.plan.name,
      amount: evento.amount ?? subscription.plan.priceAmount,
      currency: evento.currency ?? subscription.plan.priceCurrency,
      panelUrl: this.returnUrl,
    });
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
