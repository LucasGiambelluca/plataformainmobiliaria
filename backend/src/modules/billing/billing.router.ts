import { Router } from "express";
import rateLimit from "express-rate-limit";
import { env, isTest } from "@/config/env";
import { logger } from "@/config/logger";
import { authenticate } from "@/shared/middleware/authenticate";
import { authorize } from "@/shared/middleware/authorize";
import { requireTenant } from "@/shared/middleware/requireTenant";
import { validate } from "@/shared/middleware/validate";
import { asyncHandler } from "@/shared/utils/asyncHandler";
import { paymentProvider } from "@/shared/services/payments";
import { createCheckoutSchema, type CreateCheckoutBody } from "./billing.schemas";
import { BillingService } from "./billing.service";
import { notifier } from "@/modules/notifications";
import { billingRepository } from "./billing.repository";

/**
 * El webhook es público por necesidad: lo llama la pasarela, no un usuario.
 * El rate limit acota el daño de que alguien encuentre la URL y la martille;
 * quien decide si la notificación es auténtica es la verificación de firma.
 */
const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skip: () => isTest,
  message: { error: { code: "RATE_LIMITED", message: "Demasiadas notificaciones." } },
});

export function createBillingRouter(service: BillingService): Router {
  const router = Router();

  // Contratar un plan es una decisión de plata: solo el admin del tenant.
  router.post(
    "/checkout",
    authenticate,
    authorize("tenant_admin"),
    requireTenant,
    validate(createCheckoutSchema),
    asyncHandler(async (req, res) => {
      const { planId } = req.body as CreateCheckoutBody;
      const result = await service.createCheckout(req.tenantId as string, planId);
      res.json(result);
    }),
  );

  // Sin authenticate: la pasarela no tiene sesión.
  router.post(
    "/webhook",
    webhookLimiter,
    asyncHandler(async (req, res) => {
      const query = req.query as Record<string, string | undefined>;
      const body = req.body as { type?: string; data?: { id?: string } };

      // MercadoPago manda el tema y el id por query o por body según el caso.
      const topic = query.type ?? query.topic ?? body.type;
      const dataId = query["data.id"] ?? query.id ?? body.data?.id;

      const result = await service.handleWebhook({
        signature: req.headers["x-signature"] as string | undefined,
        requestId: req.headers["x-request-id"] as string | undefined,
        topic,
        dataId,
      });

      if (!result.processed) {
        logger.info({ topic, dataId }, "Webhook recibido y no procesado");
      }

      // Siempre 200 cuando la firma es válida: un error acá hace que la
      // pasarela reintente en loop una notificación que no nos sirve.
      res.status(200).json({ received: true });
    }),
  );

  return router;
}

/**
 * Instancia compartida: la usa este router y también el módulo de
 * suscripciones, para cancelar en la pasarela además de en nuestra base.
 */
export const billingService = new BillingService(
  billingRepository,
  paymentProvider,
  `${env.FRONTEND_URL}/panel/suscripcion`,
  notifier,
);

// Router con el wiring por defecto.
export const billingRouter = createBillingRouter(billingService);
