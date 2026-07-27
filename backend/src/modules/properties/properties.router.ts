import { Router } from "express";
import { authenticate } from "@/shared/middleware/authenticate";
import { authorize } from "@/shared/middleware/authorize";
import { requireTenant } from "@/shared/middleware/requireTenant";
import { validate } from "@/shared/middleware/validate";
import { asyncHandler } from "@/shared/utils/asyncHandler";
import { ValidationError } from "@/shared/errors";
import { limitService } from "@/modules/subscriptions/subscriptions.router";
import { storageProvider } from "@/shared/services/storage";
import { mediaRouter } from "@/modules/media/media.router";
import {
  changeStatusSchema,
  createPropertySchema,
  listPropertiesQuerySchema,
  updatePropertySchema,
  type ChangeStatusBody,
  type CreatePropertyBody,
  type UpdatePropertyBody,
} from "./properties.schemas";
import { PropertiesService } from "./properties.service";
import { propertiesRepository } from "./properties.repository";

// Propiedades de la inmobiliaria (§9.4). tenant_admin y agent: cargar y editar
// publicaciones es el trabajo diario de un agente.
export function createPropertiesRouter(service: PropertiesService): Router {
  const router = Router();

  router.use(authenticate, authorize("tenant_admin", "agent"), requireTenant);

  router.get(
    "/",
    asyncHandler(async (req, res) => {
      const parsed = listPropertiesQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        throw new ValidationError("Query inválida", parsed.error.issues);
      }
      res.json(await service.list(req.tenantId as string, parsed.data));
    }),
  );

  router.get(
    "/:id",
    asyncHandler(async (req, res) => {
      const property = await service.getById(req.params.id, req.tenantId as string);
      res.json({ property });
    }),
  );

  router.post(
    "/",
    validate(createPropertySchema),
    asyncHandler(async (req, res) => {
      const body = req.body as CreatePropertyBody;
      const property = await service.create(
        req.tenantId as string,
        body,
        req.user?.id ?? null,
      );
      res.status(201).json({ property });
    }),
  );

  router.patch(
    "/:id",
    validate(updatePropertySchema),
    asyncHandler(async (req, res) => {
      const body = req.body as UpdatePropertyBody;
      const property = await service.update(req.params.id, req.tenantId as string, body);
      res.json({ property });
    }),
  );

  // Publicar / pausar / destacar / volver a borrador, con transiciones validadas.
  router.patch(
    "/:id/status",
    validate(changeStatusSchema),
    asyncHandler(async (req, res) => {
      const { status } = req.body as ChangeStatusBody;
      const property = await service.changeStatus(
        req.params.id,
        req.tenantId as string,
        status,
      );
      res.json({ property });
    }),
  );

  router.delete(
    "/:id",
    asyncHandler(async (req, res) => {
      await service.remove(req.params.id, req.tenantId as string);
      res.status(204).end();
    }),
  );

  // Multimedia de la propiedad: /api/properties/:propertyId/media
  router.use("/:propertyId/media", mediaRouter);

  return router;
}

// Router con el wiring por defecto (repositorio Prisma + servicios compartidos).
export const propertiesRouter = createPropertiesRouter(
  new PropertiesService(propertiesRepository, limitService, storageProvider),
);
