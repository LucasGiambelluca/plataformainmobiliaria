import { Router } from "express";
import { env } from "@/config/env";
import { validate } from "@/shared/middleware/validate";
import { publicLimiter } from "@/shared/middleware/rateLimit";
import { asyncHandler } from "@/shared/utils/asyncHandler";
import { indexProvider } from "@/shared/services/indices";
import { cronogramaSchema, type CronogramaBody } from "./calculators.schemas";
import { CalculatorsService } from "./calculators.service";
import { indicesRepository } from "./calculators.repository";

/**
 * Calculadora de actualización de alquileres del portal (`/calculadoras`).
 *
 * Abierta y sin login: es una herramienta de consulta, no toca datos de nadie y
 * no hay tenant de por medio. Lleva el rate limit público porque un cálculo
 * puede disparar la bajada de una serie entera contra el BCRA o el INDEC.
 */
export function createCalculatorsRouter(service: CalculatorsService): Router {
  const router = Router();

  router.use(publicLimiter);

  // Rango disponible y datos de catálogo de cada serie: el frontend arma la
  // botonera y acota los selectores con esto, en vez de repetir una lista de
  // índices que puede divergir de la del backend.
  router.get(
    "/indices",
    asyncHandler(async (_req, res) => {
      res.json(await service.estadoIndices());
    }),
  );

  router.post(
    "/cronograma",
    validate(cronogramaSchema),
    asyncHandler(async (req, res) => {
      res.json(await service.calcularCronograma(req.body as CronogramaBody));
    }),
  );

  return router;
}

const service = new CalculatorsService(indicesRepository, indexProvider, {
  ttlHoras: env.INDEX_TTL_HORAS,
});

// Router con el wiring por defecto (caché Prisma + series oficiales).
export const calculatorsRouter = createCalculatorsRouter(service);
