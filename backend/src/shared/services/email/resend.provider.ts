import { AppError } from "@/shared/errors";
import { logger } from "@/config/logger";
import { fetchConTimeout, TIMEOUT_MS } from "@/shared/http/fetch-con-timeout";
import type { EmailMessage, EmailProvider } from "./email.provider";

const API = "https://api.resend.com/emails";

export interface ResendConfig {
  apiKey: string;
  /** Remitente verificado en Resend, ej. "Entre Rios Propiedades <no-reply@…>". */
  from: string;
}

export class ResendProvider implements EmailProvider {
  readonly name = "resend";

  constructor(private readonly config: ResendConfig) {}

  async send(message: EmailMessage): Promise<void> {
    // Con corte de tiempo: sin él, un Resend que acepta la conexión y no
    // responde deja esta promesa colgada para siempre, y el `await` del
    // notificador no termina nunca. Peor que fallar: acá el notificador se
    // traga el error y sigue.
    const res = await fetchConTimeout(
      API,
      TIMEOUT_MS.correo,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: this.config.from,
          to: [message.to],
          subject: message.subject,
          html: message.html,
          text: message.text,
        }),
      },
    );

    if (!res.ok) {
      const cuerpo = await res.text();
      // El destinatario puede ser dato personal: va al log, no al error.
      logger.error(
        { status: res.status, body: cuerpo, subject: message.subject },
        "Resend rechazó el envío",
      );
      throw new AppError("No se pudo enviar el correo", 502, "EMAIL_ERROR");
    }
  }
}
