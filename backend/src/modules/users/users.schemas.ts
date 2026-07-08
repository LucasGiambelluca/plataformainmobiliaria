import { z } from "zod";

// Roles asignables dentro de un tenant (super_admin jamás se crea por acá).
const tenantRoleSchema = z.enum(["tenant_admin", "agent"]);

export const createUserSchema = z.object({
  email: z.string().trim().toLowerCase().email("Email inválido"),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
  role: tenantRoleSchema,
  name: z.string().trim().min(2).max(255).optional(),
  phone: z.string().trim().max(50).optional(),
});

export type CreateUserBody = z.infer<typeof createUserSchema>;

export const updateUserSchema = z
  .object({
    name: z.string().trim().min(2).max(255).optional(),
    phone: z.string().trim().max(50).optional(),
    role: tenantRoleSchema.optional(),
    isActive: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "El body no puede estar vacío",
  });

export type UpdateUserBody = z.infer<typeof updateUserSchema>;
