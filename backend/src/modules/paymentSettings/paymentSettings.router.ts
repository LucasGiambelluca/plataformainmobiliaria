import { Router } from "express";
import { authenticate } from "@/shared/middleware/authenticate";
import { authorize } from "@/shared/middleware/authorize";
import { validate } from "@/shared/middleware/validate";
import { asyncHandler } from "@/shared/utils/asyncHandler";
import { UnauthorizedError, ValidationError } from "@/shared/errors";
import { env } from "@/config/env";
import { auditService } from "@/modules/audit/audit.router";
import type { Auditor } from "@/modules/audit/audit.service";
import { checkMercadoPagoToken } from "@/shared/services/payments/mercadopago.verify";
import {
  activateSchema,
  paymentModeSchema,
  saveCredentialsSchema,
  type ActivateBody,
  type SaveCredentialsBody,
} from "./paymentSettings.schemas";
import { PaymentSettingsService } from "./paymentSettings.service";
import { paymentSettingsRepository } from "./paymentSettings.repository";

// Credenciales de la pasarela — exclusivo del super admin.
export function createPaymentSettingsRouter(
  service: PaymentSettingsService,
  auditor: Auditor,
): Router {
  const router = Router();

  router.use(authenticate, authorize("super_admin"));

  router.get(
    "/",
    asyncHandler(async (_req, res) => {
      res.json(await service.get());
    }),
  );

  router.put(
    "/:mode",
    validate(saveCredentialsSchema),
    asyncHandler(async (req, res) => {
      const mode = paymentModeSchema.safeParse(req.params.mode);
      if (!mode.success) {
        throw new ValidationError("Modo inválido: usá sandbox o production");
      }

      const actor = req.user;
      if (!actor) throw new UnauthorizedError();

      const body = req.body as SaveCredentialsBody;
      const result = await service.saveCredentials(mode.data, body, actor.id);

      // El token no se loguea nunca: en el registro va solo el modo y los
      // cuatro últimos caracteres, que alcanzan para saber cuál se cargó.
      await auditor.record({
        tenantId: null,
        userId: actor.id,
        action: "payment_settings.update",
        entityType: "payment_settings",
        ipAddress: req.ip,
        metadata: { mode: mode.data, last4: result.last4 },
      });

      res.json(result);
    }),
  );

  router.post(
    "/activate",
    validate(activateSchema),
    asyncHandler(async (req, res) => {
      const actor = req.user;
      if (!actor) throw new UnauthorizedError();

      const { mode } = req.body as ActivateBody;
      const result = await service.activate(mode, actor.id);

      await auditor.record({
        tenantId: null,
        userId: actor.id,
        action: "payment_settings.activate",
        entityType: "payment_settings",
        ipAddress: req.ip,
        metadata: { mode },
      });

      res.json(result);
    }),
  );

  return router;
}

/** Instancia compartida: la usa este router y el resolver del provider. */
export const paymentSettingsService = new PaymentSettingsService(
  paymentSettingsRepository,
  checkMercadoPagoToken,
  env.BACKEND_URL,
);

// Router con el wiring por defecto.
export const paymentSettingsRouter = createPaymentSettingsRouter(
  paymentSettingsService,
  auditService,
);
