import { Router } from "express";
import rateLimit from "express-rate-limit";
import { isTest } from "@/config/env";
import { authenticate } from "@/shared/middleware/authenticate";
import { authorize } from "@/shared/middleware/authorize";
import { requireTenant } from "@/shared/middleware/requireTenant";
import { validate } from "@/shared/middleware/validate";
import { asyncHandler } from "@/shared/utils/asyncHandler";
import { ValidationError } from "@/shared/errors";
import {
  createInquirySchema,
  listInquiriesQuerySchema,
  updateInquirySchema,
  type CreateInquiryBody,
  type UpdateInquiryBody,
} from "./inquiries.schemas";
import { InquiriesService } from "./inquiries.service";
import { inquiriesRepository } from "./inquiries.repository";

/**
 * Más estricto que el rate limit público general: mandar consultas es una
 * escritura sin login, y es el endpoint que un spammer va a encontrar primero.
 */
const inquiryLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skip: () => isTest,
  message: {
    error: {
      code: "RATE_LIMITED",
      message: "Demasiadas consultas desde esta conexión. Probá más tarde.",
    },
  },
});

/** Alta pública, montada bajo /api/public/properties/:propertyId/inquiries. */
export function createPublicInquiriesRouter(service: InquiriesService): Router {
  const router = Router({ mergeParams: true });

  router.post(
    "/",
    inquiryLimiter,
    validate(createInquirySchema),
    asyncHandler(async (req, res) => {
      const body = req.body as CreateInquiryBody;

      // Honeypot: si el campo oculto viene lleno es un bot. Se responde 201
      // igual para no darle una señal de qué lo delató.
      if (body.website) {
        res.status(201).json({ ok: true });
        return;
      }

      const { propertyId } = req.params as { propertyId: string };
      await service.createFromProperty(propertyId, {
        name: body.name,
        email: body.email,
        ...(body.phone ? { phone: body.phone } : {}),
        message: body.message,
      });

      res.status(201).json({ ok: true });
    }),
  );

  return router;
}

/** Bandeja de la inmobiliaria (§9.8). Los agentes también atienden consultas. */
export function createInquiriesRouter(service: InquiriesService): Router {
  const router = Router();

  router.use(authenticate, authorize("tenant_admin", "agent"), requireTenant);

  router.get(
    "/",
    asyncHandler(async (req, res) => {
      const parsed = listInquiriesQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        throw new ValidationError("Query inválida", parsed.error.issues);
      }
      res.json(await service.list(req.tenantId as string, parsed.data));
    }),
  );

  router.patch(
    "/:id",
    validate(updateInquirySchema),
    asyncHandler(async (req, res) => {
      const { status } = req.body as UpdateInquiryBody;
      const inquiry = await service.changeStatus(
        req.params.id,
        req.tenantId as string,
        status,
      );
      res.json({ inquiry });
    }),
  );

  return router;
}

const service = new InquiriesService(inquiriesRepository);

// Routers con el wiring por defecto (repositorio Prisma).
export const inquiriesRouter = createInquiriesRouter(service);
export const publicInquiriesRouter = createPublicInquiriesRouter(service);
