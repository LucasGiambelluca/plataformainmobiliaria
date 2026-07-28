import { env } from "@/config/env";
import { logger } from "@/config/logger";
import { AppError } from "@/shared/errors";
import { FakeEmailProvider } from "./fake.provider";
import { ResendProvider } from "./resend.provider";
import type { EmailProvider } from "./email.provider";

export type { EmailMessage, EmailProvider } from "./email.provider";
export { FakeEmailProvider } from "./fake.provider";
export { ResendProvider } from "./resend.provider";

class UnavailableEmailProvider implements EmailProvider {
  readonly name = "unavailable";

  constructor(private readonly reason: string) {}

  send(): Promise<never> {
    throw new AppError(this.reason, 503, "EMAIL_UNAVAILABLE");
  }
}

export function createEmailProvider(): EmailProvider {
  switch (env.EMAIL_PROVIDER) {
    case "resend":
      // env.ts ya validó que estén la API key y el remitente.
      return new ResendProvider({ apiKey: env.EMAIL_API_KEY, from: env.EMAIL_FROM });

    case "fake":
      logger.warn(
        "EMAIL_PROVIDER=fake: los correos no se envían, solo se loguean. Solo para desarrollo.",
      );
      return new FakeEmailProvider();

    case "sendgrid":
      return new UnavailableEmailProvider(
        "El proveedor de correo sendgrid todavía no está implementado. Usá EMAIL_PROVIDER=resend.",
      );
  }
}

/** Instancia compartida por el servicio de notificaciones. */
export const emailProvider = createEmailProvider();
