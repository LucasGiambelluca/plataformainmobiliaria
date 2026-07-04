import type { AuthUser, ResolvedTenant } from "./auth";

declare global {
  namespace Express {
    interface Request {
      // Usuario autenticado (rutas privadas, set por authenticate).
      user?: AuthUser;
      // Tenant activo del request (JWT en rutas privadas, resolución en públicas).
      tenantId?: string | null;
      // Tenant resuelto en rutas públicas (subdominio/slug/dominio custom).
      resolvedTenant?: ResolvedTenant;
    }
  }
}

export {};
