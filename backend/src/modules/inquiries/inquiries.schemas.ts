import { z } from "zod";

export const inquiryStatusSchema = z.enum(["new", "contacted", "closed"]);

/**
 * Consulta que manda un visitante desde la ficha. No lleva tenantId ni
 * propertyId en el body a propósito: el tenant se deduce de la propiedad, y la
 * propiedad viene en la ruta. Si el cliente los mandara, podría crear consultas
 * en la bandeja de cualquier inmobiliaria.
 */
export const createInquirySchema = z.object({
  name: z.string().trim().min(2, "Ingresá tu nombre").max(255),
  email: z.string().trim().toLowerCase().email("Email inválido").max(255),
  phone: z.string().trim().max(50).optional().or(z.literal("")),
  message: z
    .string()
    .trim()
    .min(10, "Contanos un poco más (mínimo 10 caracteres)")
    .max(2000, "El mensaje es demasiado largo"),
  // Campo trampa: está oculto, así que un humano nunca lo completa. El schema
  // lo acepta con cualquier valor a propósito — rechazarlo acá devolvería 422
  // y le avisaría al bot que lo detectamos. Quien decide es el router.
  website: z.string().max(200).optional(),
});

export type CreateInquiryBody = z.infer<typeof createInquirySchema>;

export const updateInquirySchema = z.object({
  status: inquiryStatusSchema,
});

export type UpdateInquiryBody = z.infer<typeof updateInquirySchema>;

export const listInquiriesQuerySchema = z.object({
  status: inquiryStatusSchema.optional(),
  propertyId: z.string().uuid().optional(),
  search: z.string().trim().min(1).max(120).optional(),
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(100).optional(),
});

export type ListInquiriesQuery = z.infer<typeof listInquiriesQuerySchema>;
