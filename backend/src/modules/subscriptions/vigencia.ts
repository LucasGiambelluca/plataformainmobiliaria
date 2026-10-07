import type { Prisma, SubscriptionStatus } from "@prisma/client";

/**
 * Días que un plan pago sigue rigiendo después de vencer sin que entre el
 * débito. Cubre los reintentos de MercadoPago sin regalar un mes. Decisión de
 * producto del 2026-10-07.
 */
export const DIAS_DE_GRACIA = 7;
const DIA_MS = 24 * 60 * 60 * 1000;

export interface VigenciaInput {
  status: SubscriptionStatus;
  currentPeriodEnd: Date | null;
  plan: { priceAmount: string };
}

/**
 * ¿Rige el plan pago, o la inmobiliaria cae a los límites del gratuito?
 *
 * Se evalúa al leer, no con un cron (no hay scheduler en el proyecto), y NO se
 * escribe el plan gratuito en la base: pagar de nuevo restituye el plan sin
 * ningún paso extra. El estado solo no alcanza: una suscripción `active` cuyo
 * débito dejó de llegar sin ningún aviso de la pasarela también vence.
 */
export function estaAlDia(sub: VigenciaInput, ahora: Date = new Date()): boolean {
  if (Number(sub.plan.priceAmount) === 0) return true;
  if (sub.status === "suspended") return false;
  // Sin período: plan asignado a mano por el super admin, sin pasarela.
  if (!sub.currentPeriodEnd) return true;
  // Quien cancela ya decidió irse: rige lo pagado, sin gracia.
  const gracia = sub.status === "canceled" ? 0 : DIAS_DE_GRACIA * DIA_MS;
  return ahora.getTime() <= sub.currentPeriodEnd.getTime() + gracia;
}

/**
 * La misma regla como filtro SQL, para consultas que tienen que FILTRAR y no
 * evaluar de a una (el reparto de tasaciones). No contempla el plan gratuito
 * porque se combina con capacidades que el gratuito no tiene; si se usa en otro
 * lado, revisar eso. Si cambia `estaAlDia`, cambia esto.
 */
export function vigenciaWhere(ahora: Date = new Date()): Prisma.SubscriptionWhereInput {
  const limiteConGracia = new Date(ahora.getTime() - DIAS_DE_GRACIA * DIA_MS);
  return {
    OR: [
      { currentPeriodEnd: null, status: { not: "suspended" } },
      {
        status: { in: ["active", "trialing", "past_due"] },
        currentPeriodEnd: { gte: limiteConGracia },
      },
      { status: "canceled", currentPeriodEnd: { gte: ahora } },
    ],
  };
}
