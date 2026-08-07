import { z } from "zod";

export const paymentModeSchema = z.enum(["sandbox", "production"]);
export type PaymentModeInput = z.infer<typeof paymentModeSchema>;

/**
 * Los dos campos son obligatorios: no hay actualización parcial.
 *
 * Es tentador permitir rotar solo el webhook secret sin volver a pegar el
 * token, pero son campos que no se pueden leer — la pantalla muestra
 * `···· c8f2` y nada más. Un formulario donde un campo vacío a veces significa
 * "no lo cambies" y a veces "borralo" es el que termina dejando la plataforma
 * sin cobrar. Se pegan los dos juntos, que es como vienen del panel de
 * MercadoPago.
 */
export const saveCredentialsSchema = z.object({
  accessToken: z.string().trim().min(10, "El access token es demasiado corto"),
  webhookSecret: z.string().trim().min(8, "El webhook secret es demasiado corto"),
});
export type SaveCredentialsBody = z.infer<typeof saveCredentialsSchema>;

export const activateSchema = z.object({ mode: paymentModeSchema });
export type ActivateBody = z.infer<typeof activateSchema>;
