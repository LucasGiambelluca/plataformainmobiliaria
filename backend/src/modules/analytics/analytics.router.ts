import { Router } from "express";
import { authenticate } from "@/shared/middleware/authenticate";
import { authorize } from "@/shared/middleware/authorize";
import { requireTenant } from "@/shared/middleware/requireTenant";
import { asyncHandler } from "@/shared/utils/asyncHandler";
import { AnalyticsService } from "./analytics.service";
import { analyticsRepository } from "./analytics.repository";

/** Métricas globales de la plataforma (§9.2) — solo super admin. */
export function createPlatformMetricsRouter(service: AnalyticsService): Router {
  const router = Router();

  router.use(authenticate, authorize("super_admin"));

  router.get(
    "/",
    asyncHandler(async (_req, res) => {
      res.json({ metrics: await service.platform() });
    }),
  );

  return router;
}

/**
 * Métricas de la propia inmobiliaria. El tenantId sale del token, nunca de la
 * query: si viniera del cliente, un tenant podría pedir las métricas de otro.
 */
export function createTenantMetricsRouter(service: AnalyticsService): Router {
  const router = Router();

  router.use(authenticate, authorize("tenant_admin", "agent"), requireTenant);

  router.get(
    "/",
    asyncHandler(async (req, res) => {
      res.json({ metrics: await service.tenant(req.tenantId as string) });
    }),
  );

  return router;
}

const service = new AnalyticsService(analyticsRepository);

// Routers con el wiring por defecto (repositorio Prisma).
export const platformMetricsRouter = createPlatformMetricsRouter(service);
export const tenantMetricsRouter = createTenantMetricsRouter(service);


