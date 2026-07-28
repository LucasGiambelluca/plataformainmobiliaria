/**
 * Contrato de la pasarela de pagos.
 *
 * Decisión fijada en plan_estrategico.md: un proveedor detrás de una interfaz,
 * intercambiable. Se implementa MercadoPago primero.
 *
 * El modelo es de **suscripción recurrente** (preapproval en MercadoPago): el
 * cliente autoriza una vez y la pasarela debita todos los meses. La alternativa
 * —cobrar un pago suelto por período— dejaría del lado nuestro la renovación y
 * los avisos de vencimiento.
 */

export type PaymentEventStatus =
  | "approved"
  | "pending"
  | "rejected"
  | "cancelled"
  | "refunded";

export interface CheckoutSession {
  /** URL a la que se manda al usuario para autorizar el débito. */
  redirectUrl: string;
  /** Id de la suscripción del lado del proveedor. */
  externalSubscriptionId: string;
}

/**
 * Estado real de un evento, consultado al proveedor. Nunca se arma con lo que
 * viene en el cuerpo del webhook: ese cuerpo lo puede falsificar cualquiera.
 */
export interface PaymentEvent {
  externalPaymentId: string | null;
  externalSubscriptionId: string | null;
  status: PaymentEventStatus;
  amount: string | null;
  currency: string | null;
  paidAt: Date | null;
  /** Referencia que mandamos al crear el checkout: nuestra subscription.id. */
  externalReference: string | null;
}

export interface WebhookSignature {
  /** Header x-signature. */
  signature: string | undefined;
  /** Header x-request-id. */
  requestId: string | undefined;
  /** data.id de la notificación. */
  dataId: string | undefined;
}

export interface PaymentProvider {
  readonly name: string;

  createSubscriptionCheckout(params: {
    /** Nuestra subscription.id: vuelve en el webhook como external_reference. */
    reference: string;
    planName: string;
    /** Monto decimal en string, nunca float. */
    amount: string;
    currency: string;
    payerEmail: string;
    /** A dónde vuelve el usuario después de autorizar. */
    returnUrl: string;
  }): Promise<CheckoutSession>;

  cancelSubscription(externalSubscriptionId: string): Promise<void>;

  /**
   * Verifica que la notificación venga realmente del proveedor. Sin esto
   * cualquiera puede postear "pago aprobado" y quedarse con el plan caro
   * gratis: es el control más importante de todo el módulo.
   */
  verifyWebhook(params: WebhookSignature): boolean;

  /** Consulta al proveedor el estado real del evento notificado. */
  fetchEvent(params: { topic: string; id: string }): Promise<PaymentEvent | null>;
}
