import type { UserRole } from "@prisma/client";

// Payload del access token JWT.
export interface JwtPayload {
  sub: string; // user id
  tenant: string | null; // tenant id (null para super_admin)
  role: UserRole;
}

// Usuario autenticado adjunto a req.user.
export interface AuthUser {
  id: string;
  tenantId: string | null;
  role: UserRole;
}

// Tenant resuelto en rutas públicas (por subdominio / slug / dominio custom).
export interface ResolvedTenant {
  id: string;
  slug: string;
  source: "subdomain" | "slug" | "custom_domain";
}
