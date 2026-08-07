import { Router } from "express";
import { authenticate } from "@/shared/middleware/authenticate";
import { authorize } from "@/shared/middleware/authorize";
import { validate } from "@/shared/middleware/validate";
import { asyncHandler } from "@/shared/utils/asyncHandler";
import { UnauthorizedError, ValidationError } from "@/shared/errors";
import { impersonateLimiter } from "@/shared/middleware/rateLimit";
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

  // Sesión de soporte: abre el panel de la inmobiliaria en modo solo lectura.
  router.post(
    "/:id/impersonate",
    impersonateLimiter,
    asyncHandler(async (req, res) => {
      // authenticate + authorize("super_admin") garantizan el usuario, pero el
      // id se usa como identidad del suplantador y no puede quedar en null.
      const actor = req.user;
      if (!actor) throw new UnauthorizedError();

      const result = await service.impersonate(req.params.id, actor.id);

      // Va con el tenantId de la inmobiliaria para que aparezca en SU log de
      // auditoría, y con el super admin real como userId: es el punto entero
      // del registro.
      await auditor.record({
        tenantId: req.params.id,
        userId: actor.id,
        action: "impersonation.start",
        entityType: "user",
        entityId: result.user.id,
        ipAddress: req.ip,
        metadata: {
          email: result.user.email,
          expiresAt: result.expiresAt.toISOString(),
        },
      });

      res.json(result);
    }),
  );

  return router;
}

// Router con el wiring por defecto (repositorio Prisma).
export const tenantsRouter = createTenantsRouter(
  new TenantsService(tenantsRepository),
  auditService,
);
