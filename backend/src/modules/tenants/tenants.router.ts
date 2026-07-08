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
import { TenantsService } from "./tenants.service";
import { tenantsRepository } from "./tenants.repository";

// CRUD de inmobiliarias — exclusivo del super admin (§9.2).
export function createTenantsRouter(service: TenantsService): Router {
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
      res.status(201).json(result);
    }),
  );

  router.patch(
    "/:id",
    validate(updateTenantSchema),
    asyncHandler(async (req, res) => {
      const body = req.body as UpdateTenantBody;
      res.json({ tenant: await service.update(req.params.id, body) });
    }),
  );

  return router;
}

// Router con el wiring por defecto (repositorio Prisma).
export const tenantsRouter = createTenantsRouter(new TenantsService(tenantsRepository));
