import { Router } from "express";
import { authenticate } from "@/shared/middleware/authenticate";
import { authorize } from "@/shared/middleware/authorize";
import { requireTenant } from "@/shared/middleware/requireTenant";
import { asyncHandler } from "@/shared/utils/asyncHandler";
import { SubscriptionsService } from "./subscriptions.service";
import { LimitService } from "./limit.service";
import { billingService } from "@/modules/billing/billing.router";
import { subscriptionsRepository, usageRepository } from "./subscriptions.repository";

/**
 * Lo mínimo que este router necesita del módulo de cobros. Se inyecta en vez
 * de importar la instancia concreta: si no, un test de este router terminaría
 * pegándole a la base a través del repositorio real de billing.
 */
export interface GatewayCanceller {
  cancelExternal(tenantId: string): Promise<void>;
}

// Suscripción del tenant (§9.3) — solo tenant_admin.
export function createSubscriptionsRouter(
  service: SubscriptionsService,
  gateway: GatewayCanceller,
): Router {
  const router = Router();

  router.use(authenticate, authorize("tenant_admin"), requireTenant);

  router.get(
    "/",
    asyncHandler(async (req, res) => {
      res.json(await service.getStatus(req.tenantId as string));
    }),
  );

  router.post(
    "/cancel",
    asyncHandler(async (req, res) => {
      const tenantId = req.tenantId as string;
      await service.cancel(tenantId);
      // Marcar la baja en nuestra base no alcanza: si no se cancela también en
      // la pasarela, el débito automático sigue corriendo todos los meses.
      await gateway.cancelExternal(tenantId);
      res.status(204).end();
    }),
  );

  return router;
}

// Instancia compartida del enforcement de límites (la usan users/properties/media).
export const limitService = new LimitService(usageRepository);

// Router con el wiring por defecto (repositorio Prisma).
export const subscriptionsRouter = createSubscriptionsRouter(
  new SubscriptionsService(subscriptionsRepository, limitService),
  billingService,
);
