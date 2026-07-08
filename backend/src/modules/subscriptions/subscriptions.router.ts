import { Router } from "express";
import { authenticate } from "@/shared/middleware/authenticate";
import { authorize } from "@/shared/middleware/authorize";
import { requireTenant } from "@/shared/middleware/requireTenant";
import { asyncHandler } from "@/shared/utils/asyncHandler";
import { SubscriptionsService } from "./subscriptions.service";
import { LimitService } from "./limit.service";
import { subscriptionsRepository, usageRepository } from "./subscriptions.repository";

// Suscripción del tenant (§9.3) — solo tenant_admin.
export function createSubscriptionsRouter(service: SubscriptionsService): Router {
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
      await service.cancel(req.tenantId as string);
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
);
