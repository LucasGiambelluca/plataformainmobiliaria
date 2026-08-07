import { prisma } from "@/config/database";
import type { PaymentSettingsRepository, SettingsRow } from "./paymentSettings.service";
import type { PaymentModeInput } from "./paymentSettings.schemas";

// Fila única. No extiende BaseRepository: la plataforma cobra con una sola
// cuenta de MercadoPago, así que esta tabla no tiene tenant_id — igual que
// `plans`, que tampoco lo tiene.
const ID = "singleton";

/** Columnas del token y del secret según el modo, para no repetir el if. */
const COLUMNAS = {
  sandbox: { token: "sandboxAccessToken", secret: "sandboxWebhookSecret" },
  production: { token: "productionAccessToken", secret: "productionWebhookSecret" },
} as const;

export const paymentSettingsRepository: PaymentSettingsRepository = {
  async find(): Promise<SettingsRow | null> {
    const fila = await prisma.paymentSettings.findUnique({ where: { id: ID } });
    if (!fila) return null;

    // El email del autor sale aparte: updatedById es un id suelto, no una
    // relación, para que borrar un super admin no arrastre la configuración.
    const autor = fila.updatedById
      ? await prisma.user.findUnique({
          where: { id: fila.updatedById },
          select: { email: true },
        })
      : null;

    return {
      activeMode: fila.activeMode,
      sandboxAccessToken: fila.sandboxAccessToken,
      sandboxWebhookSecret: fila.sandboxWebhookSecret,
      productionAccessToken: fila.productionAccessToken,
      productionWebhookSecret: fila.productionWebhookSecret,
      updatedAt: fila.updatedAt,
      updatedByEmail: autor?.email ?? null,
    };
  },

  async saveCredentials(mode: PaymentModeInput, creds, updatedById) {
    const cols = COLUMNAS[mode];
    const datos = {
      [cols.token]: creds.accessToken,
      [cols.secret]: creds.webhookSecret,
      updatedById,
    };

    await prisma.paymentSettings.upsert({
      where: { id: ID },
      create: { id: ID, ...datos },
      update: datos,
    });
  },

  async setActiveMode(activeMode: PaymentModeInput, updatedById) {
    await prisma.paymentSettings.upsert({
      where: { id: ID },
      create: { id: ID, activeMode, updatedById },
      update: { activeMode, updatedById },
    });
  },

  countSubscriptionsWithExternalRef() {
    return prisma.subscription.count({ where: { externalRef: { not: null } } });
  },
};
