import { logger } from "@/config/logger";
import type { EmailMessage, EmailProvider } from "./email.provider";

/**
 * Proveedor que no manda nada y guarda lo enviado.
 *
 * En tests permite verificar a quién se le escribió y con qué asunto. En
 * desarrollo deja ver el correo en el log en vez de exigir una cuenta de
 * Resend para probar un alta.
 */
export class FakeEmailProvider implements EmailProvider {
  readonly name = "fake";
  readonly sent: EmailMessage[] = [];

  send(message: EmailMessage): Promise<void> {
    this.sent.push(message);
    logger.info(
      { to: message.to, subject: message.subject },
      "Correo simulado (EMAIL_PROVIDER=fake): no se envió nada",
    );
    return Promise.resolve();
  }
}
