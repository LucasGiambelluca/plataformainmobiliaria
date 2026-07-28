import { z } from "zod";

export const createCheckoutSchema = z.object({
  planId: z.string().uuid("Plan inválido"),
});

export type CreateCheckoutBody = z.infer<typeof createCheckoutSchema>;

/**
 * MercadoPago manda el tema y el id por query string o por body según el tipo
 * de notificación, así que se aceptan las dos formas y el router las unifica.
 */
export const webhookQuerySchema = z.object({
  type: z.string().optional(),
  topic: z.string().optional(),
  "data.id": z.string().optional(),
  id: z.string().optional(),
});
