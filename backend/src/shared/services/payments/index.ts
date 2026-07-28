import { env } from "@/config/env";
import { logger } from "@/config/logger";
import { AppError } from "@/shared/errors";
import { FakePaymentProvider } from "./fake.provider";
import { MercadoPagoProvider } from "./mercadopago.provider";
import type { PaymentProvider } from "./payment.provider";

export type {
  CheckoutSession,
  PaymentEvent,
  PaymentEventStatus,
  PaymentProvider,
  WebhookSignature,
} from "./payment.provider";
export { FakePaymentProvider } from "./fake.provider";
export { MercadoPagoProvider } from "./mercadopago.provider";

/** Proveedor que se niega a operar, para los que todavía no están escritos. */
class UnavailablePaymentProvider implements PaymentProvider {
  readonly name = "unavailable";

  constructor(private readonly reason: string) {}

  private fail(): never {
    throw new AppError(this.reason, 503, "PAYMENT_UNAVAILABLE");
  }

  createSubscriptionCheckout(): Promise<never> {
    return this.fail();
  }
  cancelSubscription(): Promise<never> {
    return this.fail();
  }
  verifyWebhook(): boolean {
    // Nunca aceptar una firma de un proveedor que no sabemos verificar.
    return false;
  }
  fetchEvent(): Promise<never> {
    return this.fail();
  }
}

export function createPaymentProvider(): PaymentProvider {
  switch (env.PAYMENT_PROVIDER) {
    case "mercadopago":
      // env.ts ya validó que estén el access token y el webhook secret.
      return new MercadoPagoProvider({
        accessToken: env.PAYMENT_API_KEY,
        webhookSecret: env.PAYMENT_WEBHOOK_SECRET,
        backendUrl: env.BACKEND_URL,
      });

    case "fake":
      logger.warn(
        "PAYMENT_PROVIDER=fake: los cobros son simulados y las firmas de webhook no se verifican. Solo para desarrollo.",
      );
      return new FakePaymentProvider();

    case "stripe":
      return new UnavailablePaymentProvider(
        "El proveedor de pagos stripe todavía no está implementado. Usá PAYMENT_PROVIDER=mercadopago.",
      );
  }
}

/** Instancia compartida por el módulo de billing. */
export const paymentProvider = createPaymentProvider();
