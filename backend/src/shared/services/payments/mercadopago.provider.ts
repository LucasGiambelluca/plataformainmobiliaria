import { createHmac, timingSafeEqual } from "node:crypto";
import { AppError } from "@/shared/errors";
import { logger } from "@/config/logger";
import type {
  CheckoutSession,
  PaymentEvent,
  PaymentEventStatus,
  PaymentProvider,
  WebhookSignature,
} from "./payment.provider";

const API = "https://api.mercadopago.com";

export interface MercadoPagoConfig {
  accessToken: string;
  webhookSecret: string;
  /** URL pública del backend, para armar el notification_url. */
  backendUrl: string;
}

/** Estados de MercadoPago mapeados a los nuestros. */
const ESTADOS: Record<string, PaymentEventStatus> = {
  approved: "approved",
  authorized: "approved",
  pending: "pending",
  in_process: "pending",
  in_mediation: "pending",
  rejected: "rejected",
  cancelled: "cancelled",
  paused: "cancelled",
  refunded: "refunded",
  charged_back: "refunded",
};

export class MercadoPagoProvider implements PaymentProvider {
  readonly name = "mercadopago";

  constructor(private readonly config: MercadoPagoConfig) {}

  async createSubscriptionCheckout(params: {
    reference: string;
    planName: string;
    amount: string;
    currency: string;
    payerEmail: string;
    returnUrl: string;
  }): Promise<CheckoutSession> {
    const body = {
      reason: `Suscripción ${params.planName}`,
      external_reference: params.reference,
      payer_email: params.payerEmail,
      back_url: params.returnUrl,
      notification_url: `${this.config.backendUrl}/api/billing/webhook`,
      auto_recurring: {
        frequency: 1,
        frequency_type: "months",
        // Number acá es inevitable: la API lo exige numérico. El string es la
        // fuente de verdad y solo se convierte en el borde.
        transaction_amount: Number(params.amount),
        currency_id: params.currency,
      },
    };

    const res = await this.request("/preapproval", { method: "POST", body });

    const redirectUrl = res.init_point ?? res.sandbox_init_point;
    if (typeof redirectUrl !== "string" || typeof res.id !== "string") {
      throw new AppError("MercadoPago no devolvió un checkout válido", 502, "PAYMENT_ERROR");
    }

    return { redirectUrl, externalSubscriptionId: res.id };
  }

  async cancelSubscription(externalSubscriptionId: string): Promise<void> {
    await this.request(`/preapproval/${externalSubscriptionId}`, {
      method: "PUT",
      body: { status: "cancelled" },
    });
  }

  /**
   * Firma de MercadoPago: HMAC-SHA256 sobre
   * `id:<data.id>;request-id:<x-request-id>;ts:<ts>;` con el webhook secret.
   * El header llega como "ts=1700000000,v1=abc123...".
   */
  verifyWebhook({ signature, requestId, dataId }: WebhookSignature): boolean {
    if (!signature || !dataId) return false;

    const partes = Object.fromEntries(
      signature.split(",").map((p) => {
        const [k, ...resto] = p.split("=");
        return [k.trim(), resto.join("=").trim()];
      }),
    );
    const ts = partes.ts;
    const v1 = partes.v1;
    if (!ts || !v1) return false;

    // El id llega en minúsculas en el manifiesto según la doc de MP.
    const manifest = `id:${dataId.toLowerCase()};request-id:${requestId ?? ""};ts:${ts};`;
    const esperado = createHmac("sha256", this.config.webhookSecret)
      .update(manifest)
      .digest("hex");

    // Comparación en tiempo constante: una comparación normal filtra el
    // secreto byte por byte a quien mida los tiempos de respuesta.
    const a = Buffer.from(esperado, "hex");
    const b = Buffer.from(v1, "hex");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  }

  async fetchEvent({ topic, id }: { topic: string; id: string }): Promise<PaymentEvent | null> {
    if (topic === "payment") {
      const p = await this.request(`/v1/payments/${id}`, { method: "GET" });
      return {
        externalPaymentId: String(p.id),
        externalSubscriptionId:
          typeof p.metadata?.preapproval_id === "string" ? p.metadata.preapproval_id : null,
        status: ESTADOS[String(p.status)] ?? "pending",
        amount: p.transaction_amount != null ? String(p.transaction_amount) : null,
        currency: typeof p.currency_id === "string" ? p.currency_id : null,
        paidAt: p.date_approved ? new Date(String(p.date_approved)) : null,
        externalReference:
          typeof p.external_reference === "string" ? p.external_reference : null,
      };
    }

    if (topic === "preapproval" || topic === "subscription_preapproval") {
      const s = await this.request(`/preapproval/${id}`, { method: "GET" });
      return {
        externalPaymentId: null,
        externalSubscriptionId: String(s.id),
        status: ESTADOS[String(s.status)] ?? "pending",
        amount:
          s.auto_recurring?.transaction_amount != null
            ? String(s.auto_recurring.transaction_amount)
            : null,
        currency:
          typeof s.auto_recurring?.currency_id === "string"
            ? s.auto_recurring.currency_id
            : null,
        paidAt: null,
        externalReference:
          typeof s.external_reference === "string" ? s.external_reference : null,
      };
    }

    // Tema que no manejamos (chargebacks, merchant_order…): no es un error.
    logger.info({ topic }, "Webhook de MercadoPago ignorado: tema no manejado");
    return null;
  }

  private async request(
    path: string,
    options: { method: string; body?: unknown },
  ): Promise<Record<string, any>> {
    const res = await fetch(`${API}${path}`, {
      method: options.method,
      headers: {
        Authorization: `Bearer ${this.config.accessToken}`,
        "Content-Type": "application/json",
      },
      ...(options.body ? { body: JSON.stringify(options.body) } : {}),
    });

    const texto = await res.text();
    if (!res.ok) {
      // El cuerpo puede traer datos del comercio: se loguea, no se propaga.
      logger.error({ path, status: res.status, body: texto }, "MercadoPago respondió con error");
      throw new AppError(
        "La pasarela de pagos rechazó la operación",
        502,
        "PAYMENT_ERROR",
      );
    }

    return texto ? (JSON.parse(texto) as Record<string, any>) : {};
  }
}
