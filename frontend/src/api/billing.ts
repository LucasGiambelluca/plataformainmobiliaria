import { getJson, postJson } from '../lib/api'
import {
  checkoutResponseSchema,
  publicPlansResponseSchema,
  type PublicPlan,
} from './schemas'

/** Los precios son públicos: no hace falta ser super admin para verlos. */
export async function getPlans(): Promise<PublicPlan[]> {
  const { plans } = await getJson('/public/plans', publicPlansResponseSchema)
  return plans
}

/**
 * Arranca el cobro de un plan y devuelve la URL de la pasarela.
 *
 * El plan NO cambia acá: recién se aplica cuando la pasarela confirma el pago
 * por webhook. Quien llame a esto solo tiene que redirigir.
 */
export async function startCheckout(planId: string): Promise<string> {
  const { redirectUrl } = await postJson('/billing/checkout', checkoutResponseSchema, {
    planId,
  })
  return redirectUrl
}
