import { Router } from "express";
import { z } from "zod";
import { authenticate } from "@/shared/middleware/authenticate";
import { authorize } from "@/shared/middleware/authorize";
import { asyncHandler } from "@/shared/utils/asyncHandler";
import { ValidationError } from "@/shared/errors";
import { AUDIT_ACTIONS, AuditService } from "./audit.service";
import { auditRepository } from "./audit.repository";

const listQuerySchema = z.object({
  action: z.enum(AUDIT_ACTIONS).optional(),
  tenantId: z.string().uuid().optional(),
  userId: z.string().uuid().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(100).optional(),
});

/**
 * Auditoría (§9.2) — exclusiva del super admin. Los registros cruzan tenants,
 * así que exponerlos a un tenant_admin le mostraría actividad de otras
 * inmobiliarias.
 */
export function createAuditRouter(service: AuditService): Router {
  const router = Router();

  router.use(authenticate, authorize("super_admin"));

  router.get(
    "/",
    asyncHandler(async (req, res) => {
      const parsed = listQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        throw new ValidationError("Query inválida", parsed.error.issues);
      }
      res.json(await service.list(parsed.data));
    }),
  );

  // Alimenta el desplegable de filtros del panel.
  router.get("/actions", (_req, res) => {
    res.json({ actions: AUDIT_ACTIONS });
  });

  return router;
}

/** Instancia compartida: la usan los módulos que registran acciones. */
export const auditService = new AuditService(auditRepository);

export const auditRouter = createAuditRouter(auditService);
