/**
 * Contrato de envío de correo.
 *
 * Regla que atraviesa todo el módulo: **mandar un mail nunca puede romper la
 * operación que lo disparó**. Si el proveedor está caído, la consulta se
 * guarda igual y el pago se acredita igual; el correo se pierde y queda en el
 * log. Por eso los métodos de notificación no propagan errores.
 */
export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  /** Alternativa en texto plano: hay clientes que no renderizan HTML. */
  text: string;
}

export interface EmailProvider {
  readonly name: string;
  send(message: EmailMessage): Promise<void>;
}
