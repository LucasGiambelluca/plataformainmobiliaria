import { z } from "zod";
import { slugSchema } from "@/modules/tenants/tenants.schemas";

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Email inválido"),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
});

export type LoginInput = z.infer<typeof loginSchema>;

// Alta self-serve: inmobiliaria + usuario admin (§9.1).
export const registerSchema = z.object({
  tenantName: z.string().trim().min(2, "El nombre debe tener al menos 2 caracteres").max(255),
  slug: slugSchema,
  email: z.string().trim().toLowerCase().email("Email inválido"),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
  name: z.string().trim().min(2).max(255).optional(),
});

export type RegisterInput = z.infer<typeof registerSchema>;
