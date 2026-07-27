import type { NextFunction, Request, Response } from "express";
import { env } from "@/config/env";
import { NotFoundError } from "@/shared/errors";
import { asyncHandler } from "@/shared/utils/asyncHandler";
import type { ResolvedTenant } from "@/types/auth";

export interface TenantLookup {
  id: string;
  slug: string;
}

export interface TenantResolverRepository {
  /** Solo inmobiliarias activas: una suspendida no debe tener web pública. */
  findActiveBySlug(slug: string): Promise<TenantLookup | null>;
  /** Solo dominios ya verificados y apuntando a un tenant activo. */
  findActiveByVerifiedDomain(domain: string): Promise<TenantLookup | null>;
}

/**
 * Subdominios que nunca son una inmobiliaria. Sin esta lista, apuntar
 * `www.plataforma.com` intentaría resolver un tenant de slug "www".
 */
const RESERVADOS = new Set(["www", "api", "admin", "app", "cdn", "static", "mail"]);

/** Quita el puerto y normaliza: "Demo.Plataforma.com:5173" → "demo.plataforma.com". */
function normalizarHost(host: string | undefined): string {
  return (host ?? "").split(":")[0].trim().toLowerCase();
}

/**
 * Extrae el subdominio si el host cuelga del dominio de la plataforma.
 * Devuelve null para el dominio pelado, para www y para hosts ajenos.
 */
export function subdominioDe(host: string, platformDomain: string): string | null {
  const base = platformDomain.toLowerCase();
  if (!host.endsWith(`.${base}`)) return null;

  const label = host.slice(0, -(base.length + 1));
  // Solo un nivel: "a.b.plataforma.com" no es el tenant "a.b".
  if (!label || label.includes(".") || RESERVADOS.has(label)) return null;
  return label;
}

/**
 * Resuelve a qué inmobiliaria pertenece el request (tareas 1.7 y 1.21).
 *
 * Orden: el slug explícito de la ruta gana, después el subdominio de la
 * plataforma, y por último el dominio propio. Es lo que permite que la misma
 * web se sirva desde /inmobiliaria/demo, demo.plataforma.com o el dominio de
 * la inmobiliaria, sin duplicar código ni buildear un sitio por tenant.
 *
 * `required: false` deja pasar el request sin tenant (útil en rutas que
 * funcionan tanto en el portal como dentro de una web propia).
 */
export function createResolveTenant(
  repo: TenantResolverRepository,
  options: { required?: boolean } = {},
) {
  const required = options.required ?? true;

  return asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
    const resuelto = await resolver(req, repo);

    if (!resuelto) {
      if (required) throw new NotFoundError("Inmobiliaria no encontrada");
      return next();
    }

    req.resolvedTenant = resuelto;
    req.tenantId = resuelto.id;
    next();
  });
}

async function resolver(
  req: Request,
  repo: TenantResolverRepository,
): Promise<ResolvedTenant | null> {
  const slugParam = (req.params as Record<string, string | undefined>).slug;
  if (slugParam) {
    const tenant = await repo.findActiveBySlug(slugParam.toLowerCase());
    return tenant ? { ...tenant, source: "slug" } : null;
  }

  const host = normalizarHost(req.headers.host);
  if (!host) return null;

  const label = subdominioDe(host, env.PLATFORM_DOMAIN);
  if (label) {
    const tenant = await repo.findActiveBySlug(label);
    return tenant ? { ...tenant, source: "subdomain" } : null;
  }

  // Dominio propio. Se compara contra tenant_domains, nunca contra el slug:
  // si no está verificado, no hay web.
  const tenant = await repo.findActiveByVerifiedDomain(host);
  return tenant ? { ...tenant, source: "custom_domain" } : null;
}
