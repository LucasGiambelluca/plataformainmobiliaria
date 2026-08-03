import { prisma } from "@/config/database";
import type { CertificateAuthorizationRepository } from "./caddy.service";

/**
 * Estados que ameritan un certificado.
 *
 * `verifying` entra además de `active` porque mientras el DNS propaga el host
 * ya resuelve acá y conviene tener el certificado listo. No abre nada: la web
 * la sirve `resolveTenant`, que solo resuelve dominios `active`, así que hasta
 * que verifique el visitante ve el portal, no la web de la inmobiliaria.
 *
 * `pending` y `failed` quedan afuera: uno todavía no se chequeó y el otro
 * apunta a otro lado.
 */
const CERTIFICABLES = ["active", "verifying"] as const;

export const certificateAuthorizationRepository: CertificateAuthorizationRepository =
  {
    async hasActiveTenantWithSlug(slug: string): Promise<boolean> {
      const tenant = await prisma.tenant.findFirst({
        where: { slug, isActive: true },
        select: { id: true },
      });
      return tenant !== null;
    },

    async hasCertifiableDomain(domain: string): Promise<boolean> {
      const row = await prisma.tenantDomain.findFirst({
        // La inmobiliaria suspendida no tiene web, así que tampoco certificado.
        where: {
          domain,
          status: { in: [...CERTIFICABLES] },
          tenant: { isActive: true },
        },
        select: { id: true },
      });
      return row !== null;
    },
  };
