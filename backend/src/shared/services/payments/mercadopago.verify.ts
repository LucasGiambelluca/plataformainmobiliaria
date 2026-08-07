import { logger } from "@/config/logger";

export type TokenCheck = "ok" | "rejected" | "unreachable";

/**
 * Pregunta a MercadoPago si un access token sirve, antes de guardarlo.
 *
 * Distingue tres desenlaces a propósito. Un token mal pegado tiene que frenarse
 * acá, porque si no el error aparece recién cuando una inmobiliaria intenta
 * pagar. Pero MercadoPago caído no puede impedir guardar: es la misma regla que
 * el proyecto ya aplica al correo y a las series de índices.
 *
 * Valida el access token, NO el webhook secret: ese no tiene endpoint de
 * verificación y se ejerce con el primer webhook real.
 */
export async function checkMercadoPagoToken(accessToken: string): Promise<TokenCheck> {
  try {
    const res = await fetch("https://api.mercadopago.com/users/me", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (res.ok) return "ok";
    if (res.status === 401 || res.status === 403) return "rejected";

    logger.warn({ status: res.status }, "MercadoPago no pudo validar el token");
    return "unreachable";
  } catch (err) {
    logger.warn({ err }, "No se pudo contactar a MercadoPago para validar el token");
    return "unreachable";
  }
}
