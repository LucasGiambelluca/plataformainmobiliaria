import { createHmac, timingSafeEqual } from "node:crypto";
import { AppError } from "@/shared/errors";
import { logger } from "@/config/logger";
import { fetchConTimeout, TIMEOUT_MS } from "@/shared/http/fetch-con-timeout";
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

const textoONull = (v: unknown): string | null => (typeof v === "string" ? v : null);

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
      // Variante sin `card_token_id`: el cliente carga la tarjeta en la página
      // de MercadoPago, y el débito queda pendiente hasta que la autoriza.
      status: "pending",
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
        // A qué débito automático pertenece el pago. Según cómo lo genere
        // MercadoPago viene en un lugar o en el otro.
        externalSubscriptionId: textoONull(
          p.metadata?.preapproval_id ?? p.point_of_interaction?.transaction_data?.subscription_id,
        ),
        status: ESTADOS[String(p.status)] ?? "pending",
        amount: p.transaction_amount != null ? String(p.transaction_amount) : null,
        currency: typeof p.currency_id === "string" ? p.currency_id : null,
        paidAt: p.date_approved ? new Date(String(p.date_approved)) : null,
        externalReference:
          typeof p.external_reference === "string" ? p.external_reference : null,
      };
    }

    // Así llegan los débitos de los meses 2 en adelante. Sin esta rama caían en
    // "tema no manejado": se cobraba y no se registraba nada (C1 de AUDITORIA.md).
    if (topic === "subscription_authorized_payment") {
      const a = await this.request(`/authorized_payments/${id}`, { method: "GET" });
      const pago = a.payment;
      // Programado y sin intento de cobro todavía: no hay nada que registrar.
      if (pago?.id == null) return null;
      const status = ESTADOS[String(pago.status)] ?? "pending";
      return {
        // El id del PAGO y no el del authorized_payment: es el mismo que trae
        // el topic `payment`, así que si llegan los dos se deduplican solos.
        externalPaymentId: String(pago.id),
        externalSubscriptionId: textoONull(a.preapproval_id),
        status,
        amount: a.transaction_amount != null ? String(a.transaction_amount) : null,
        currency: textoONull(a.currency_id),
        paidAt: status === "approved" && a.debit_date ? new Date(String(a.debit_date)) : null,
        externalReference: textoONull(a.external_reference),
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
    // Con corte de tiempo, y acá importa más que en los otros lugares: esta es
    // la llamada que el webhook hace para preguntar el estado REAL del cobro. Si
    // quedara colgada, la respuesta al webhook nunca sale, la pasarela reintenta
    // para siempre y la transacción de la base — que la espera — queda abierta.
    const res = await fetchConTimeout(
      `${API}${path}`,
      TIMEOUT_MS.pago,
      {
        method: options.method,
        headers: {
          Authorization: `Bearer ${this.config.accessToken}`,
          "Content-Type": "application/json",
        },
        ...(options.body ? { body: JSON.stringify(options.body) } : {}),
      },
    );

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
