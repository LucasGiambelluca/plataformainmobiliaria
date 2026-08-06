import { Router } from "express";
import rateLimit from "express-rate-limit";
import { isTest } from "@/config/env";
import { authenticate } from "@/shared/middleware/authenticate";
import { authorize } from "@/shared/middleware/authorize";
import { requireTenant } from "@/shared/middleware/requireTenant";
import { validate } from "@/shared/middleware/validate";
import { publicLimiter } from "@/shared/middleware/rateLimit";
import { asyncHandler } from "@/shared/utils/asyncHandler";
import { ValidationError } from "@/shared/errors";
import { notifier, panelUrls } from "@/modules/notifications";
import {
  appraisalConfirmMediaSchema,
  appraisalUploadUrlSchema,
  createAppraisalSchema,
  listAppraisalsQuerySchema,
  participantsQuerySchema,
  updateAppraisalSchema,
  type AppraisalConfirmMediaBody,
  type AppraisalUploadUrlBody,
  type CreateAppraisalBody,
  type UpdateAppraisalBody,
} from "./appraisals.schemas";
import { AppraisalMediaService } from "./appraisals.media.service";
import { appraisalMediaRepository } from "./appraisals.media.repository";
import { storageProvider } from "@/shared/services/storage";
import {
  AppraisalsService,
  type AppraisalRecord,
  type ParticipantAgency,
} from "./appraisals.service";
import { appraisalsRepository } from "./appraisals.repository";

/**
 * Más estricto que el límite público general: es una escritura sin login con
 * datos personales de un tercero, y el formulario es largo. Un bot que lo
 * encuentre no debería poder llenar la base.
 */
const appraisalLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skip: () => isTest,
  message: {
    error: {
      code: "RATE_LIMITED",
      message: "Demasiadas solicitudes desde esta conexión. Probá más tarde.",
    },
  },
});

/**
 * Lo que el portal muestra de una participante.
 *
 * `lastAssignedAt` se recorta a propósito: es contabilidad interna del reparto
 * y publicarla dejaría ver quién viene recibiendo trabajo y quién no.
 */
function aPublica(agencia: ParticipantAgency) {
  return {
    id: agencia.id,
    name: agencia.name,
    slug: agencia.slug,
    logoUrl: agencia.logoUrl,
  };
}

/**
 * Subida de fotos por un anónimo: más estricta todavía que el alta.
 *
 * Cada llamada firma una escritura contra un bucket de lectura pública. El
 * tope por hora es alto en relación al alta porque una sola solicitud puede
 * llevar varias fotos, pero sigue siendo por IP.
 */
const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 40,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skip: () => isTest,
  message: {
    error: {
      code: "RATE_LIMITED",
      message: "Demasiadas fotos desde esta conexión. Probá más tarde.",
    },
  },
});

/** Alta pública, montada bajo /api/public/appraisals. */
export function createPublicAppraisalsRouter(
  service: AppraisalsService,
  media?: AppraisalMediaService,
): Router {
  const router = Router();

  if (media) {
    router.post(
      "/upload-url",
      uploadLimiter,
      validate(appraisalUploadUrlSchema),
      asyncHandler(async (req, res) => {
        const body = req.body as AppraisalUploadUrlBody;
        res.status(201).json(await media.createUploadUrl(body));
      }),
    );

    router.post(
      "/media/:id/confirm",
      uploadLimiter,
      validate(appraisalConfirmMediaSchema),
      asyncHandler(async (req, res) => {
        const { draftId } = req.body as AppraisalConfirmMediaBody;
        await media.confirm(req.params.id, draftId);
        res.json({ ok: true });
      }),
    );
  }

  router.get(
    "/participants",
    publicLimiter,
    asyncHandler(async (req, res) => {
      const parsed = participantsQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        throw new ValidationError("Query inválida", parsed.error.issues);
      }

      const agencies = await service.listParticipants(parsed.data.city);
      res.json({ agencies: agencies.map(aPublica) });
    }),
  );

  router.post(
    "/",
    appraisalLimiter,
    validate(createAppraisalSchema),
    asyncHandler(async (req, res) => {
      const body = req.body as CreateAppraisalBody;

      // Honeypot: si el campo oculto viene lleno es un bot. Se responde 201
      // igual para no darle la señal de qué lo delató.
      if (body.website) {
        res.status(201).json({ ok: true });
        return;
      }

      const creada = await service.create({
        name: body.name,
        phone: body.phone,
        email: body.email,
        city: body.city,
        address: body.address,
        propertyType: body.propertyType,
        purpose: body.purpose,
        ...(body.neighborhood ? { neighborhood: body.neighborhood } : {}),
        ...(body.areaM2 !== undefined ? { areaM2: String(body.areaM2) } : {}),
        ...(body.rooms !== undefined ? { rooms: body.rooms } : {}),
        ...(body.bathrooms !== undefined ? { bathrooms: body.bathrooms } : {}),
        ...(body.condition ? { condition: body.condition } : {}),
        ...(body.comments ? { comments: body.comments } : {}),
        ...(body.details ? { details: body.details } : {}),
        ...(body.tenantId ? { tenantId: body.tenantId } : {}),
        ...(body.draftId ? { draftId: body.draftId } : {}),
      });

      // No se devuelve la solicitud entera: lleva los datos personales de quien
      // la mandó y la respuesta viaja por una conexión sin autenticar.
      res.status(201).json({
        ok: true,
        assigned: creada.tenantId !== null,
      });

      // Limpieza perezosa de fotos abandonadas, después de responder: sin
      // scheduler, el alta es el único momento garantizado en que alguien pasa
      // por acá. No se espera y no puede fallar hacia afuera — el método se
      // traga sus errores — así que no demora ni rompe esta respuesta.
      if (media) void media.limpiarHuerfanos();
    }),
  );

  return router;
}

/** Bandeja de la inmobiliaria. Los agentes también atienden tasaciones. */
export function createAppraisalsRouter(service: AppraisalsService): Router {
  const router = Router();

  router.use(authenticate, authorize("tenant_admin", "agent"), requireTenant);

  router.get(
    "/",
    asyncHandler(async (req, res) => {
      const parsed = listAppraisalsQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        throw new ValidationError("Query inválida", parsed.error.issues);
      }
      res.json(await service.list(req.tenantId as string, parsed.data));
    }),
  );

  router.patch(
    "/:id",
    validate(updateAppraisalSchema),
    asyncHandler(async (req, res) => {
      const { status } = req.body as UpdateAppraisalBody;
      const appraisal: AppraisalRecord = await service.changeStatus(
        req.params.id,
        req.tenantId as string,
        status,
      );
      res.json({ appraisal });
    }),
  );

  return router;
}

/**
 * Solicitudes que ninguna inmobiliaria pudo tomar (§ super admin).
 *
 * Existe porque restringir el servicio al plan premium hace que en localidades
 * sin participante la solicitud quede huérfana. Alguien tiene que verlas: son
 * personas que dejaron su teléfono esperando una respuesta.
 */
export function createAdminAppraisalsRouter(service: AppraisalsService): Router {
  const router = Router();

  router.use(authenticate, authorize("super_admin"));

  router.get(
    "/",
    asyncHandler(async (req, res) => {
      const parsed = listAppraisalsQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        throw new ValidationError("Query inválida", parsed.error.issues);
      }
      res.json(await service.listUnassigned(parsed.data));
    }),
  );

  return router;
}

/**
 * Adapta el notificador general a lo que este módulo necesita.
 *
 * El service no conoce plantillas ni direcciones de panel: solo sabe que
 * "hay que avisar". Esto traduce.
 */
const appraisalNotifier = {
  async appraisalReceived(
    appraisal: AppraisalRecord,
    agency: ParticipantAgency,
  ): Promise<void> {
    await notifier.tasacionRecibida(agency.contactEmail, {
      agencyName: agency.name,
      name: appraisal.name,
      email: appraisal.email,
      phone: appraisal.phone,
      city: appraisal.city,
      address: appraisal.address,
      propertyType: appraisal.propertyType,
      panelUrl: panelUrls.tasaciones,
    });
  },
};

const service = new AppraisalsService(appraisalsRepository, appraisalNotifier);

const mediaService = new AppraisalMediaService(
  appraisalMediaRepository,
  storageProvider,
);

// Routers con el wiring por defecto (repositorio Prisma + notificador real).
export const publicAppraisalsRouter = createPublicAppraisalsRouter(
  service,
  mediaService,
);
export const appraisalsRouter = createAppraisalsRouter(service);
export const adminAppraisalsRouter = createAdminAppraisalsRouter(service);
