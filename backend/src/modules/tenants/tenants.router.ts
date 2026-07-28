import { Router } from "express";
import { authenticate } from "@/shared/middleware/authenticate";
import { authorize } from "@/shared/middleware/authorize";
import { validate } from "@/shared/middleware/validate";
import { asyncHandler } from "@/shared/utils/asyncHandler";
import { ValidationError } from "@/shared/errors";
import {
  listTenantsQuerySchema,
  provisionSchema,
  updateTenantSchema,
  type ProvisionBody,
  type UpdateTenantBody,
} from "./tenants.schemas";
import { auditService } from "@/modules/audit/audit.router";
import type { Auditor } from "@/modules/audit/audit.service";
import { TenantsService } from "./tenants.service";
import { tenantsRepository } from "./tenants.repository";

// CRUD de inmobiliarias — exclusivo del super admin (§9.2).
export function createTenantsRouter(
  service: TenantsService,
  auditor: Auditor,
): Router {
  const router = Router();

  router.use(authenticate, authorize("super_admin"));

  router.get(
    "/",
    asyncHandler(async (req, res) => {
      const parsed = listTenantsQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        throw new ValidationError("Query inválida", parsed.error.issues);
      }
      res.json(await service.list(parsed.data));
    }),
  );

  router.get(
    "/:id",
    asyncHandler(async (req, res) => {
      res.json({ tenant: await service.getById(req.params.id) });
    }),
  );

  router.post(
    "/",
    validate(provisionSchema),
    asyncHandler(async (req, res) => {
      const body = req.body as ProvisionBody;
      const result = await service.provision(body);

      await auditor.record({
        tenantId: result.tenant.id,
        userId: req.user?.id ?? null,
        action: "tenant.create",
        entityType: "tenant",
        entityId: result.tenant.id,
        ipAddress: req.ip,
        metadata: { name: result.tenant.name, slug: result.tenant.slug },
      });

      res.status(201).json(result);
    }),
  );

  router.patch(
    "/:id",
    validate(updateTenantSchema),
    asyncHandler(async (req, res) => {
      const body = req.body as UpdateTenantBody;
      const tenant = await service.update(req.params.id, body);

      // Suspender o reactivar se registra aparte: son las acciones que uno
      // busca cuando pregunta "quién dejó a esta inmobiliaria sin servicio".
      const accion =
        body.isActive === false
          ? "tenant.suspend"
          : body.isActive === true
            ? "tenant.activate"
            : "tenant.update";

      await auditor.record({
        tenantId: req.params.id,
        userId: req.user?.id ?? null,
        action: accion,
        entityType: "tenant",
        entityId: req.params.id,
        ipAddress: req.ip,
        metadata: { cambios: Object.keys(body) },
      });

      res.json({ tenant });
    }),
  );

  return router;
}

// Router con el wiring por defecto (repositorio Prisma).
export const tenantsRouter = createTenantsRouter(
  new TenantsService(tenantsRepository),
  auditService,
);
