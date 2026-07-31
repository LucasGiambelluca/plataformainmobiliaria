import { z } from "zod";

/**
 * Un hostname válido: etiquetas alfanuméricas separadas por puntos, guiones
 * permitidos salvo al principio o al final de cada etiqueta, y un TLD de al
 * menos dos letras.
 *
 * Deliberadamente NO acepta protocolo, puerto, path ni comodines. Lo que se
 * guarda acá se compara letra por letra contra el header `Host` en
 * `resolveTenant`: si entrara "https://midominio.com/" nunca matchearía y el
 * dominio quedaría verificado pero muerto.
 */
const HOSTNAME = /^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))*\.[a-z]{2,}$/;

export const domainSchema = z
  .string()
  .trim()
  .toLowerCase()
  // Errores de tipeo frecuentes: pegar la URL entera del navegador.
  .transform((v) => v.replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/\.$/, ""))
  .refine((v) => v.length <= 253, "El dominio es demasiado largo")
  .refine((v) => HOSTNAME.test(v), "Dominio inválido. Ejemplo: midominio.com.ar");

export const createDomainSchema = z.object({
  domain: domainSchema,
});

export type CreateDomainBody = z.infer<typeof createDomainSchema>;

export const DOMAIN_STATUSES = ["pending", "verifying", "active", "failed"] as const;

/** Filtros del listado global del super admin. */
export const listDomainsQuerySchema = z.object({
  status: z.enum(DOMAIN_STATUSES).optional(),
  tenantId: z.string().uuid().optional(),
  search: z.string().trim().min(1).max(253).optional(),
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(100).optional(),
});

export type ListDomainsQuery = z.infer<typeof listDomainsQuerySchema>;
