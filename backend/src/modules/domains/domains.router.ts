import { Router } from "express";
import { env } from "@/config/env";
import { authenticate } from "@/shared/middleware/authenticate";
import { authorize } from "@/shared/middleware/authorize";
import { requireTenant } from "@/shared/middleware/requireTenant";
import { validate } from "@/shared/middleware/validate";
import { dnsCheckLimiter } from "@/shared/middleware/rateLimit";
import { asyncHandler } from "@/shared/utils/asyncHandler";
import { ValidationError } from "@/shared/errors";
import { dnsResolver } from "@/shared/services/dns";
import { auditService } from "@/modules/audit/audit.router";
import type { Auditor } from "@/modules/audit/audit.service";
import { limitService } from "@/modules/subscriptions/subscriptions.router";
import {
  createDomainSchema,
  listDomainsQuerySchema,
  type CreateDomainBody,
} from "./domains.schemas";
import { DomainsService } from "./domains.service";
import { domainsRepository } from "./domains.repository";

/**
 * Dominios propios de la inmobiliaria (§9.7, tarea 1.21).
 *
 * Solo tenant_admin: apuntar un dominio decide desde qué host se sirve la web
 * entera de la inmobiliaria, no es una tarea de un agente.
 */
export function createDomainsRouter(service: DomainsService, auditor: Auditor): Router {
  const router = Router();

  router.use(authenticate, authorize("tenant_admin"), requireTenant);

  router.get(
    "/",
    asyncHandler(async (req, res) => {
      res.json(await service.list(req.tenantId as string));
    }),
  );

  router.post(
    "/",
    validate(createDomainSchema),
    asyncHandler(async (req, res) => {
      const { domain } = req.body as CreateDomainBody;
      const created = await service.create(req.tenantId as string, domain);

      await auditor.record({
        tenantId: created.tenantId,
        userId: req.user?.id ?? null,
        action: "domain.create",
        entityType: "domain",
        entityId: created.id,
        ipAddress: req.ip,
        metadata: { domain: created.domain },
      });

      res.status(201).json({ domain: created });
    }),
  );

  // Cada llamada dispara consultas DNS salientes: va con límite propio.
  router.post(
    "/:id/verify",
    dnsCheckLimiter,
    asyncHandler(async (req, res) => {
      const result = await service.verify(req.tenantId as string, req.params.id);

      await auditor.record({
        tenantId: result.domain.tenantId,
        userId: req.user?.id ?? null,
        action: "domain.verify",
        entityType: "domain",
        entityId: result.domain.id,
        ipAddress: req.ip,
        metadata: { domain: result.domain.domain, status: result.domain.status },
      });

      res.json(result);
    }),
  );

  router.delete(
    "/:id",
    asyncHandler(async (req, res) => {
      const tenantId = req.tenantId as string;
      await service.remove(tenantId, req.params.id);

      await auditor.record({
        tenantId,
        userId: req.user?.id ?? null,
        action: "domain.delete",
        entityType: "domain",
        entityId: req.params.id,
        ipAddress: req.ip,
      });

      res.status(204).end();
    }),
  );

  return router;
}

/**
 * Vista global de dominios (§9.2) — exclusiva del super admin. Cruza
 * inmobiliarias, así que abrirla a un tenant_admin le mostraría los dominios
 * de la competencia.
 *
 * No expone un "marcar como activo": el estado sale siempre del DNS. Sí expone
 * la baja, que es la salida cuando alguien reclama un dominio ajeno y lo deja
 * bloqueado.
 */
export function createAdminDomainsRouter(
  service: DomainsService,
  auditor: Auditor,
): Router {
  const router = Router();

  router.use(authenticate, authorize("super_admin"));

  router.get(
    "/",
    asyncHandler(async (req, res) => {
      const parsed = listDomainsQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        throw new ValidationError("Query inválida", parsed.error.issues);
      }
      res.json(await service.listAll(parsed.data));
    }),
  );

  router.post(
    "/:id/verify",
    dnsCheckLimiter,
    asyncHandler(async (req, res) => {
      const result = await service.verifyAny(req.params.id);

      await auditor.record({
        tenantId: result.domain.tenantId,
        userId: req.user?.id ?? null,
        action: "domain.verify",
        entityType: "domain",
        entityId: result.domain.id,
        ipAddress: req.ip,
        metadata: { domain: result.domain.domain, status: result.domain.status },
      });

      res.json(result);
    }),
  );

  router.delete(
    "/:id",
    asyncHandler(async (req, res) => {
      await service.removeAny(req.params.id);

      await auditor.record({
        tenantId: null,
        userId: req.user?.id ?? null,
        action: "domain.delete",
        entityType: "domain",
        entityId: req.params.id,
        ipAddress: req.ip,
      });

      res.status(204).end();
    }),
  );

  return router;
}

const service = new DomainsService(domainsRepository, limitService, dnsResolver, {
  platformDomain: env.PLATFORM_DOMAIN,
  dnsTarget: env.CUSTOM_DOMAIN_TARGET,
});

// Routers con el wiring por defecto (repositorio Prisma + DNS real).
export const domainsRouter = createDomainsRouter(service, auditService);
export const adminDomainsRouter = createAdminDomainsRouter(service, auditService);
