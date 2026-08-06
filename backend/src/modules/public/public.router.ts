import { Router } from "express";
import { publicLimiter } from "@/shared/middleware/rateLimit";
import { asyncHandler } from "@/shared/utils/asyncHandler";
import { ValidationError } from "@/shared/errors";
import { publicCatalogQuerySchema } from "./public.schemas";
import { PublicService } from "./public.service";
import { publicRepository } from "./public.repository";

/**
 * Catálogo público (§9.5). Sin autenticación y cruzando inmobiliarias: es la
 * cara abierta de la plataforma.
 *
 * No lleva `authenticate` ni `requireTenant` a propósito. Lo que reemplaza al
 * aislamiento por tenant es el filtro de visibilidad del repositorio, que solo
 * devuelve publicadas/destacadas de inmobiliarias activas.
 */
export function createPublicRouter(service: PublicService): Router {
  const router = Router();

  // Es el único router expuesto sin login: el rate limit no es opcional.
  router.use(publicLimiter);

  router.get(
    "/properties",
    asyncHandler(async (req, res) => {
      const parsed = publicCatalogQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        throw new ValidationError("Query inválida", parsed.error.issues);
      }
      res.json(await service.catalog(parsed.data));
    }),
  );

  router.get(
    "/properties/:id",
    asyncHandler(async (req, res) => {
      res.json({ property: await service.property(req.params.id) });
    }),
  );

  router.get(
    "/agencies",
    asyncHandler(async (_req, res) => {
      res.json({ agencies: await service.agencies() });
    }),
  );

  // Los precios son información pública: cualquiera puede verlos antes de
  // registrarse, y el panel de la inmobiliaria los necesita para el upgrade.
  router.get(
    "/plans",
    asyncHandler(async (_req, res) => {
      res.json({ plans: await service.plans() });
    }),
  );

  // Alimenta el buscador por localidad de la home: son las localidades que hoy
  // tienen propiedades publicadas, con su conteo.
  router.get(
    "/cities",
    asyncHandler(async (_req, res) => {
      res.json({ cities: await service.cities() });
    }),
  );

  // El catálogo completo, tengan propiedades o no. Es lo que llena los
  // desplegables del alta de propiedad y del formulario de tasación: ahí hace
  // falta poder elegir una localidad donde todavía no publicó nadie.
  router.get("/localidades", (_req, res) => {
    res.json({ localidades: service.localidades() });
  });

  return router;
}

// Router con el wiring por defecto (repositorio Prisma).
export const publicRouter = createPublicRouter(new PublicService(publicRepository));
