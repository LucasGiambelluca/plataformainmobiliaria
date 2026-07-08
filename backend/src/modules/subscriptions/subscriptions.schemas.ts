import { z } from "zod";
import { slugSchema } from "@/modules/tenants/tenants.schemas";

// Monto como string decimal ("29999" o "29999.50") — evita floats para plata.
const priceAmountSchema = z
  .string()
  .regex(/^\d+(\.\d{1,2})?$/, "Monto inválido: usar formato decimal, ej. 29999.99");

export const createPlanSchema = z.object({
  name: z.string().trim().min(2).max(100),
  slug: slugSchema,
  priceAmount: priceAmountSchema,
  priceCurrency: z.string().length(3).toUpperCase().optional(),
  billingInterval: z.enum(["monthly", "yearly"]).optional(),
  maxProperties: z.number().int().positive(),
  maxUsers: z.number().int().positive(),
  maxStorageMb: z.number().int().positive(),
});

export type CreatePlanBody = z.infer<typeof createPlanSchema>;

export const updatePlanSchema = z
  .object({
    name: z.string().trim().min(2).max(100).optional(),
    slug: slugSchema.optional(),
    priceAmount: priceAmountSchema.optional(),
    priceCurrency: z.string().length(3).toUpperCase().optional(),
    billingInterval: z.enum(["monthly", "yearly"]).optional(),
    maxProperties: z.number().int().positive().optional(),
    maxUsers: z.number().int().positive().optional(),
    maxStorageMb: z.number().int().positive().optional(),
    isActive: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "El body no puede estar vacío",
  });

export type UpdatePlanBody = z.infer<typeof updatePlanSchema>;
