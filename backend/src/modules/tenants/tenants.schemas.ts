import { z } from "zod";

// Slug: minúsculas, números y guiones; sin espacios ni guiones en los bordes.
export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "El slug debe tener al menos 3 caracteres")
  .max(100)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Slug inválido: usá minúsculas, números y guiones");

export const provisionSchema = z.object({
  tenantName: z.string().trim().min(2, "El nombre debe tener al menos 2 caracteres").max(255),
  slug: slugSchema,
  adminEmail: z.string().trim().toLowerCase().email("Email inválido"),
  adminPassword: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
  adminName: z.string().trim().min(2).max(255).optional(),
});

export type ProvisionBody = z.infer<typeof provisionSchema>;

export const updateTenantSchema = z
  .object({
    name: z.string().trim().min(2).max(255).optional(),
    description: z.string().trim().max(2000).optional(),
    contactEmail: z.string().trim().toLowerCase().email().optional(),
    contactPhone: z.string().trim().max(50).optional(),
    logoUrl: z.string().url().optional(),
    isActive: z.boolean().optional(),
    planId: z.string().uuid().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "El body no puede estar vacío",
  });

export type UpdateTenantBody = z.infer<typeof updateTenantSchema>;

export const listTenantsQuerySchema = z.object({
  search: z.string().trim().min(1).optional(),
  isActive: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .optional(),
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().optional(),
});
