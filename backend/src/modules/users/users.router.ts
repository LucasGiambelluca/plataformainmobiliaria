import { Router } from "express";
import { authenticate } from "@/shared/middleware/authenticate";
import { authorize } from "@/shared/middleware/authorize";
import { requireTenant } from "@/shared/middleware/requireTenant";
import { validate } from "@/shared/middleware/validate";
import { asyncHandler } from "@/shared/utils/asyncHandler";
import {
  createUserSchema,
  updateUserSchema,
  type CreateUserBody,
  type UpdateUserBody,
} from "./users.schemas";
import { limitService } from "@/modules/subscriptions/subscriptions.router";
import { UsersService } from "./users.service";
import { usersRepository } from "./users.repository";

// Gestión de usuarios del tenant (§9.6) — solo tenant_admin (§8.2).
export function createUsersRouter(service: UsersService): Router {
  const router = Router();

  router.use(authenticate, authorize("tenant_admin"), requireTenant);

  router.get(
    "/",
    asyncHandler(async (req, res) => {
      res.json({ users: await service.list(req.tenantId as string) });
    }),
  );

  router.post(
    "/",
    validate(createUserSchema),
    asyncHandler(async (req, res) => {
      const body = req.body as CreateUserBody;
      const user = await service.create(req.tenantId as string, body);
      res.status(201).json({ user });
    }),
  );

  router.patch(
    "/:id",
    validate(updateUserSchema),
    asyncHandler(async (req, res) => {
      const body = req.body as UpdateUserBody;
      // authenticate + requireTenant garantizan user y tenantId presentes.
      const user = await service.update(
        req.tenantId as string,
        req.params.id,
        req.user!.id,
        body,
      );
      res.json({ user });
    }),
  );

  router.delete(
    "/:id",
    asyncHandler(async (req, res) => {
      await service.deactivate(req.tenantId as string, req.params.id, req.user!.id);
      res.status(204).end();
    }),
  );

  return router;
}

// Router con el wiring por defecto (repositorio Prisma + LimitService compartido).
export const usersRouter = createUsersRouter(
  new UsersService(usersRepository, limitService),
);
