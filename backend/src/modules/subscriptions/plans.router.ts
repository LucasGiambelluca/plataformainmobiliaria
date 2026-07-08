import { Router } from "express";
import { authenticate } from "@/shared/middleware/authenticate";
import { authorize } from "@/shared/middleware/authorize";
import { validate } from "@/shared/middleware/validate";
import { asyncHandler } from "@/shared/utils/asyncHandler";
import {
  createPlanSchema,
  updatePlanSchema,
  type CreatePlanBody,
  type UpdatePlanBody,
} from "./subscriptions.schemas";
import { PlansService } from "./plans.service";
import { plansRepository } from "./subscriptions.repository";

// CRUD de planes (§9.2) — exclusivo del super admin.
export function createPlansRouter(service: PlansService): Router {
  const router = Router();

  router.use(authenticate, authorize("super_admin"));

  router.get(
    "/",
    asyncHandler(async (_req, res) => {
      res.json({ plans: await service.list() });
    }),
  );

  router.post(
    "/",
    validate(createPlanSchema),
    asyncHandler(async (req, res) => {
      const body = req.body as CreatePlanBody;
      res.status(201).json({ plan: await service.create(body) });
    }),
  );

  router.patch(
    "/:id",
    validate(updatePlanSchema),
    asyncHandler(async (req, res) => {
      const body = req.body as UpdatePlanBody;
      res.json({ plan: await service.update(req.params.id, body) });
    }),
  );

  return router;
}

// Router con el wiring por defecto (repositorio Prisma).
export const plansRouter = createPlansRouter(new PlansService(plansRepository));
