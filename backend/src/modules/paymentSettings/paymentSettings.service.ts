import { ValidationError } from "@/shared/errors";
import { decryptSecret, encryptSecret, last4 } from "@/shared/services/crypto/secretBox";
import type { TokenCheck } from "@/shared/services/payments/mercadopago.verify";
import type { PaymentModeInput } from "./paymentSettings.schemas";

export interface SettingsRow {
  activeMode: PaymentModeInput;
  sandboxAccessToken: string | null;
  sandboxWebhookSecret: string | null;
  productionAccessToken: string | null;
  productionWebhookSecret: string | null;
  updatedAt: Date;
  updatedByEmail: string | null;
}

export interface PaymentSettingsRepository {
  find(): Promise<SettingsRow | null>;
  saveCredentials(
    mode: PaymentModeInput,
    creds: { accessToken: string; webhookSecret: string },
    updatedById: string,
  ): Promise<void>;
  setActiveMode(mode: PaymentModeInput, updatedById: string): Promise<void>;
  /** Suscripciones con externalRef vivo: las que quedan huérfanas al cambiar. */
  countSubscriptionsWithExternalRef(): Promise<number>;
}

export interface CredentialStatus {
  configured: boolean;
  last4: string | null;
}

export interface SettingsStatus {
  activeMode: PaymentModeInput;
  credentials: { sandbox: CredentialStatus; production: CredentialStatus };
  webhookUrl: string;
  updatedAt: Date | null;
  updatedBy: string | null;
}

/** Credenciales en claro del modo activo, para armar el provider. */
export interface ActiveCredentials {
  accessToken: string;
  webhookSecret: string;
}

function estadoDe(cifrado: string | null): CredentialStatus {
  if (!cifrado) return { configured: false, last4: null };
  return { configured: true, last4: last4(decryptSecret(cifrado)) };
}

export class PaymentSettingsService {
  constructor(
    private readonly repo: PaymentSettingsRepository,
    private readonly checkToken: (accessToken: string) => Promise<TokenCheck>,
    private readonly backendUrl: string,
  ) {}

  async get(): Promise<SettingsStatus> {
    const fila = await this.repo.find();
    const webhookUrl = `${this.backendUrl}/api/billing/webhook`;

    if (!fila) {
      return {
        activeMode: "sandbox",
        credentials: {
          sandbox: { configured: false, last4: null },
          production: { configured: false, last4: null },
        },
        webhookUrl,
        updatedAt: null,
        updatedBy: null,
      };
    }

    return {
      activeMode: fila.activeMode,
      credentials: {
        sandbox: estadoDe(fila.sandboxAccessToken),
        production: estadoDe(fila.productionAccessToken),
      },
      webhookUrl,
      updatedAt: fila.updatedAt,
      updatedBy: fila.updatedByEmail,
    };
  }

  /**
   * Guarda un juego de credenciales, cifrado.
   *
   * Un token que MercadoPago rechaza no se guarda: el error tiene que aparecer
   * acá y no cuando una inmobiliaria intenta pagar. Pero si MercadoPago no
   * contesta se guarda igual y se avisa — un proveedor caído no puede voltear
   * la pantalla de configuración.
   */
  async saveCredentials(
    mode: PaymentModeInput,
    creds: { accessToken: string; webhookSecret: string },
    actorId: string,
  ): Promise<{ verified: boolean; last4: string }> {
    const check = await this.checkToken(creds.accessToken);
    if (check === "rejected") {
      throw new ValidationError("MercadoPago rechazó esas credenciales");
    }

    await this.repo.saveCredentials(
      mode,
      {
        accessToken: encryptSecret(creds.accessToken),
        webhookSecret: encryptSecret(creds.webhookSecret),
      },
      actorId,
    );

    return { verified: check === "ok", last4: last4(creds.accessToken) };
  }

  /**
   * Cambia el modo activo.
   *
   * Devuelve cuántas suscripciones quedan huérfanas: un preapproval nacido en
   * una cuenta no se puede consultar ni cancelar con el token de otra, así que
   * después del cambio esos externalRef apuntan a algo que la credencial nueva
   * no ve. No se bloquea —pasar de sandbox a producción el día del lanzamiento
   * es legítimo— pero el que aprieta tiene que saberlo.
   */
  async activate(
    mode: PaymentModeInput,
    actorId: string,
  ): Promise<{ activeMode: PaymentModeInput; orphanedSubscriptions: number }> {
    const huerfanas = await this.repo.countSubscriptionsWithExternalRef();
    await this.repo.setActiveMode(mode, actorId);
    return { activeMode: mode, orphanedSubscriptions: huerfanas };
  }

  /** Credenciales en claro del modo activo. null si no hay nada cargado. */
  async activeCredentials(): Promise<ActiveCredentials | null> {
    const fila = await this.repo.find();
    if (!fila) return null;

    const token =
      fila.activeMode === "production"
        ? fila.productionAccessToken
        : fila.sandboxAccessToken;
    const secret =
      fila.activeMode === "production"
        ? fila.productionWebhookSecret
        : fila.sandboxWebhookSecret;

    if (!token || !secret) return null;
    return { accessToken: decryptSecret(token), webhookSecret: decryptSecret(secret) };
  }
}
