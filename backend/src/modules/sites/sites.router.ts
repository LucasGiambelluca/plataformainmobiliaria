import { Router } from "express";
import { authenticate } from "@/shared/middleware/authenticate";
import { authorize } from "@/shared/middleware/authorize";
import { requireTenant } from "@/shared/middleware/requireTenant";
import { validate } from "@/shared/middleware/validate";
import { publicLimiter } from "@/shared/middleware/rateLimit";
import { asyncHandler } from "@/shared/utils/asyncHandler";
import { storageProvider } from "@/shared/services/storage";
import {
  createResolveTenant,
  type TenantResolverRepository,
} from "@/shared/middleware/resolveTenant";
import {
  createCarouselUploadSchema,
  reorderCarouselSchema,
  updateCarouselSchema,
  updateSiteConfigSchema,
  type CreateCarouselUploadBody,
  type ReorderCarouselBody,
  type UpdateCarouselBody,
  type UpdateSiteConfigBody,
} from "./sites.schemas";
import { SitesService } from "./sites.service";
import { sitesRepository, tenantResolverRepository } from "./sites.repository";

/**
 * "Mi Sitio Web" de la inmobiliaria (§9.7). Solo tenant_admin: definir cómo se
 * ve la web de la inmobiliaria no es tarea de un agente.
 */
export function createSitesRouter(service: SitesService): Router {
  const router = Router();

  router.use(authenticate, authorize("tenant_admin"), requireTenant);

  router.get(
    "/",
    asyncHandler(async (req, res) => {
      res.json({ site: await service.getOwn(req.tenantId as string) });
    }),
  );

  router.patch(
    "/",
    validate(updateSiteConfigSchema),
    asyncHandler(async (req, res) => {
      const body = req.body as UpdateSiteConfigBody;
      res.json({ site: await service.update(req.tenantId as string, body) });
    }),
  );

  // Carrousel: mismo esquema de dos pasos que la multimedia de propiedades.
  router.post(
    "/carousel/upload-url",
    validate(createCarouselUploadSchema),
    asyncHandler(async (req, res) => {
      const body = req.body as CreateCarouselUploadBody;
      const result = await service.createCarouselUpload(req.tenantId as string, body);
      res.status(201).json(result);
    }),
  );

  router.post(
    "/carousel/:id/confirm",
    asyncHandler(async (req, res) => {
      const image = await service.confirmCarouselUpload(
        req.tenantId as string,
        req.params.id,
      );
      res.json({ image });
    }),
  );

  router.put(
    "/carousel/order",
    validate(reorderCarouselSchema),
    asyncHandler(async (req, res) => {
      const { ids } = req.body as ReorderCarouselBody;
      const carousel = await service.reorderCarousel(req.tenantId as string, ids);
      res.json({ carousel });
    }),
  );

  router.patch(
    "/carousel/:id",
    validate(updateCarouselSchema),
    asyncHandler(async (req, res) => {
      const body = req.body as UpdateCarouselBody;
      const image = await service.updateCarousel(
        req.tenantId as string,
        req.params.id,
        body,
      );
      res.json({ image });
    }),
  );

  router.delete(
    "/carousel/:id",
    asyncHandler(async (req, res) => {
      await service.removeCarousel(req.tenantId as string, req.params.id);
      res.status(204).end();
    }),
  );

  return router;
}

/**
 * Web pública de una inmobiliaria, por slug. Sin autenticación: es la cara
 * abierta de cada tenant. Devuelve 404 si el sitio no está publicado.
 */
export function createPublicSitesRouter(
  service: SitesService,
  resolverRepo: TenantResolverRepository,
): Router {
  const router = Router();

  router.use(publicLimiter);

  // Resuelve la inmobiliaria a partir del host del pedido. Es el endpoint que
  // van a usar el subdominio y el dominio propio: la misma web servida desde
  // demo.plataforma.com o inmobiliarianorte.com, sin slug en la URL.
  //
  // Va antes de /:slug porque "current" matchearía como slug.
  router.get(
    "/current",
    createResolveTenant(resolverRepo),
    asyncHandler(async (req, res) => {
      res.json(await service.getPublic(req.resolvedTenant!.slug));
    }),
  );

  router.get(
    "/:slug",
    asyncHandler(async (req, res) => {
      res.json(await service.getPublic(req.params.slug.toLowerCase()));
    }),
  );

  return router;
}

const service = new SitesService(sitesRepository, storageProvider);

// Routers con el wiring por defecto (repositorio Prisma + storage compartido).
export const sitesRouter = createSitesRouter(service);
export const publicSitesRouter = createPublicSitesRouter(service, tenantResolverRepository);
