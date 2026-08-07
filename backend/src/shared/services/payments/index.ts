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

export type PaymentProviderResolver = () => Promise<PaymentProvider>;

export interface ResolverDeps {
  providerName: "mercadopago" | "stripe" | "fake";
  /** Credenciales en claro del modo activo, o null si no hay nada cargado. */
  loadCredentials: () => Promise<{ accessToken: string; webhookSecret: string } | null>;
  backendUrl: string;
}

/**
 * Arma el proveedor de pagos en cada operación.
 *
 * Sin caché a propósito: el volumen es un checkout por inmobiliaria por mes más
 * los webhooks, así que una query por operación es ruido. A cambio no hay nada
 * que invalidar, el cambio de credenciales toma efecto en el acto y sigue
 * siendo correcto si mañana corren dos procesos Node. Si alguna vez importa, la
 * caché entra como decorador de este resolver sin tocar nada más.
 */
/**
 * Instancia única del proveedor simulado.
 *
 * Tiene que ser única porque el fake **tiene estado**: `pretendEvent` registra
 * qué va a devolver `fetchEvent`, y `checkouts`/`cancelled` acumulan lo que se
 * le pidió. Si el resolver creara uno nuevo por operación, registrar un pago
 * aprobado no tendría ningún efecto sobre la instancia que después atiende el
 * webhook. Los tests de integración se apoyan en esto para simular un cobro
 * sin red.
 */
export const fakePaymentProvider = new FakePaymentProvider();

export function createPaymentProviderResolver(deps: ResolverDeps): PaymentProviderResolver {
  return async () => {
    if (deps.providerName === "fake") return fakePaymentProvider;

    if (deps.providerName === "stripe") {
      return new UnavailablePaymentProvider(
        "El proveedor de pagos stripe todavía no está implementado. Usá PAYMENT_PROVIDER=mercadopago.",
      );
    }

    const creds = await deps.loadCredentials();
    if (!creds) {
      // Nótese que UnavailablePaymentProvider.verifyWebhook() devuelve false:
      // una plataforma sin configurar RECHAZA los webhooks en vez de
      // aceptarlos. El modo de falla correcto.
      return new UnavailablePaymentProvider(
        "MercadoPago no está configurado. Cargá las credenciales en /admin/pagos.",
      );
    }

    return new MercadoPagoProvider({
      accessToken: creds.accessToken,
      webhookSecret: creds.webhookSecret,
      backendUrl: deps.backendUrl,
    });
  };
}

// El aviso va una sola vez al arrancar, no en cada resolución.
if (env.PAYMENT_PROVIDER === "fake") {
  logger.warn(
    "PAYMENT_PROVIDER=fake: los cobros son simulados y las firmas de webhook no se verifican. Solo para desarrollo.",
  );
}
