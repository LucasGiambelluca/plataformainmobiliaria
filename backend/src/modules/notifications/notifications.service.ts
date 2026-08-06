import { logger } from "@/config/logger";
import type { EmailProvider } from "@/shared/services/email";
import {
  bienvenida,
  nuevaTasacion,
  nuevoLead,
  pagoAprobado,
  pagoRechazado,
  type BienvenidaData,
  type NuevaTasacionData,
  type NuevoLeadData,
  type PagoData,
} from "./templates";

/**
 * Qué se notifica y cuándo. Lo consumen auth, inquiries y billing.
 *
 * Se declara como interfaz para que esos módulos dependan de esto y no del
 * proveedor de correo: en sus tests se inyecta un doble y nadie manda mails.
 */
export interface Notifier {
  leadRecibido(to: string | null, data: NuevoLeadData): Promise<void>;
  inmobiliariaCreada(to: string, data: BienvenidaData): Promise<void>;
  pagoConfirmado(to: string | null, data: PagoData): Promise<void>;
  pagoFallido(to: string | null, data: PagoData): Promise<void>;
  tasacionRecibida(to: string | null, data: NuevaTasacionData): Promise<void>;
}

export class NotificationsService implements Notifier {
  constructor(private readonly email: EmailProvider) {}

  leadRecibido(to: string | null, data: NuevoLeadData): Promise<void> {
    return this.enviar(to, () => nuevoLead(to as string, data), "lead recibido");
  }

  inmobiliariaCreada(to: string, data: BienvenidaData): Promise<void> {
    return this.enviar(to, () => bienvenida(to, data), "bienvenida");
  }

  pagoConfirmado(to: string | null, data: PagoData): Promise<void> {
    return this.enviar(to, () => pagoAprobado(to as string, data), "pago confirmado");
  }

  pagoFallido(to: string | null, data: PagoData): Promise<void> {
    return this.enviar(to, () => pagoRechazado(to as string, data), "pago rechazado");
  }

  tasacionRecibida(to: string | null, data: NuevaTasacionData): Promise<void> {
    return this.enviar(to, () => nuevaTasacion(to as string, data), "tasación recibida");
  }

  /**
   * Envía sin propagar errores. Un proveedor de correo caído no puede tumbar
   * la consulta que se acaba de guardar ni el pago que se acaba de acreditar:
   * el correo se pierde, queda en el log, y la operación sigue.
   */
  private async enviar(
    to: string | null,
    armar: () => Parameters<EmailProvider["send"]>[0],
    tipo: string,
  ): Promise<void> {
    if (!to) {
      logger.warn({ tipo }, "Notificación sin destinatario: no se envía");
      return;
    }

    try {
      await this.email.send(armar());
    } catch (err) {
      logger.error({ err, tipo, to }, "No se pudo enviar la notificación");
    }
  }
}

/** Doble inerte para tests y para consumidores que no quieren notificar. */
export const noopNotifier: Notifier = {
  leadRecibido: () => Promise.resolve(),
  inmobiliariaCreada: () => Promise.resolve(),
  pagoConfirmado: () => Promise.resolve(),
  pagoFallido: () => Promise.resolve(),
  tasacionRecibida: () => Promise.resolve(),
};
