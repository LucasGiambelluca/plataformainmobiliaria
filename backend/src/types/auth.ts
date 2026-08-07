import type { UserRole } from "@prisma/client";

// Payload del access token JWT.
export interface JwtPayload {
  sub: string; // user id
  tenant: string | null; // tenant id (null para super_admin)
  role: UserRole;
  /**
   * id del super admin que está actuando en nombre de `sub`. Solo lo llevan los
   * tokens de suplantación. El nombre sale del claim `act` de RFC 8693, que
   * nombra exactamente esto: quién actúa en nombre de quién.
   */
  act?: string;
  /** Marca de solo lectura. Solo la llevan los tokens de suplantación. */
  ro?: true;
}

// Usuario autenticado adjunto a req.user.
export interface AuthUser {
  id: string;
  tenantId: string | null;
  role: UserRole;
  /** id del super admin que suplanta. Ausente en sesiones normales. */
  impersonatorId?: string;
  /** true en sesiones de suplantación: no pueden escribir. */
  readOnly?: boolean;
}

// Tenant resuelto en rutas públicas (por subdominio / slug / dominio custom).
export interface ResolvedTenant {
  id: string;
  slug: string;
  source: "subdomain" | "slug" | "custom_domain";
}
