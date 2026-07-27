import { Router } from "express";
import { authorize } from "@/shared/middleware/authorize";
import { requireTenant } from "@/shared/middleware/requireTenant";
import { validate } from "@/shared/middleware/validate";
import { asyncHandler } from "@/shared/utils/asyncHandler";
import { limitService } from "@/modules/subscriptions/subscriptions.router";
import { storageProvider } from "@/shared/services/storage";
import {
  createUploadSchema,
  reorderMediaSchema,
  updateMediaSchema,
  type CreateUploadBody,
  type ReorderMediaBody,
  type UpdateMediaBody,
} from "./media.schemas";
import { MediaService } from "./media.service";
import { mediaRepository } from "./media.repository";

/**
 * Multimedia de una propiedad. Se monta anidado bajo
 * /api/properties/:propertyId/media, por eso `mergeParams`.
 *
 * El router padre ya corre `authenticate`; acá se repiten `authorize` y
 * `requireTenant` para que este router no dependa de dónde lo monten.
 */
export function createMediaRouter(service: MediaService): Router {
  const router = Router({ mergeParams: true });

  router.use(authorize("tenant_admin", "agent"), requireTenant);

  router.get(
    "/",
    asyncHandler(async (req, res) => {
      const media = await service.list(req.params.propertyId, req.tenantId as string);
      res.json({ media });
    }),
  );

  // Paso 1: firma la subida directa del navegador al storage.
  router.post(
    "/upload-url",
    validate(createUploadSchema),
    asyncHandler(async (req, res) => {
      const body = req.body as CreateUploadBody;
      const result = await service.createUpload(
        req.params.propertyId,
        req.tenantId as string,
        body,
      );
      res.status(201).json(result);
    }),
  );

  // Paso 2: el navegador terminó el PUT y se verifica el archivo real.
  router.post(
    "/:mediaId/confirm",
    asyncHandler(async (req, res) => {
      const media = await service.confirmUpload(
        req.params.propertyId,
        req.params.mediaId,
        req.tenantId as string,
      );
      res.json({ media });
    }),
  );

  router.patch(
    "/:mediaId",
    validate(updateMediaSchema),
    asyncHandler(async (req, res) => {
      const body = req.body as UpdateMediaBody;
      const media = await service.update(
        req.params.propertyId,
        req.params.mediaId,
        req.tenantId as string,
        body,
      );
      res.json({ media });
    }),
  );

  router.put(
    "/order",
    validate(reorderMediaSchema),
    asyncHandler(async (req, res) => {
      const { ids: order } = req.body as ReorderMediaBody;
      const media = await service.reorder(
        req.params.propertyId,
        req.tenantId as string,
        order,
      );
      res.json({ media });
    }),
  );

  router.delete(
    "/:mediaId",
    asyncHandler(async (req, res) => {
      await service.remove(
        req.params.propertyId,
        req.params.mediaId,
        req.tenantId as string,
      );
      res.status(204).end();
    }),
  );

  return router;
}

// Router con el wiring por defecto (repositorio Prisma + servicios compartidos).
export const mediaRouter = createMediaRouter(
  new MediaService(mediaRepository, limitService, storageProvider),
);
