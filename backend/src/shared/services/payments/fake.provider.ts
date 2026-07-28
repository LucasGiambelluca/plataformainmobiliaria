import { randomUUID } from "node:crypto";
import type {
  CheckoutSession,
  PaymentEvent,
  PaymentProvider,
  WebhookSignature,
} from "./payment.provider";

/**
 * Pasarela simulada. Dos usos:
 *
 * 1. Tests: permite ejercitar todo el flujo de cobro sin red ni credenciales.
 * 2. Desarrollo sin cuenta de MercadoPago: el backend arranca y el checkout
 *    devuelve una URL falsa en vez de romper.
 *
 * `verifyWebhook` acepta todo a propósito — en tests la firma no aporta nada.
 * Justamente por eso este provider NUNCA debe usarse en producción: `env.ts`
 * exige credenciales reales cuando PAYMENT_PROVIDER=mercadopago.
 */
export class FakePaymentProvider implements PaymentProvider {
  readonly name = "fake";
  readonly checkouts: { reference: string; amount: string }[] = [];
  readonly cancelled: string[] = [];
  private readonly eventos = new Map<string, PaymentEvent>();

  createSubscriptionCheckout(params: {
    reference: string;
    planName: string;
    amount: string;
    currency: string;
    payerEmail: string;
    returnUrl: string;
  }): Promise<CheckoutSession> {
    this.checkouts.push({ reference: params.reference, amount: params.amount });
    const externalSubscriptionId = `fake-sub-${randomUUID()}`;
    return Promise.resolve({
      redirectUrl: `https://pagos.local/checkout/${externalSubscriptionId}`,
      externalSubscriptionId,
    });
  }

  cancelSubscription(externalSubscriptionId: string): Promise<void> {
    this.cancelled.push(externalSubscriptionId);
    return Promise.resolve();
  }

  verifyWebhook(_params: WebhookSignature): boolean {
    return true;
  }

  /** Registra el evento que devolverá `fetchEvent` para ese id. */
  pretendEvent(id: string, event: PaymentEvent): void {
    this.eventos.set(id, event);
  }

  fetchEvent({ id }: { topic: string; id: string }): Promise<PaymentEvent | null> {
    return Promise.resolve(this.eventos.get(id) ?? null);
  }
}
