import { getJson, patchJson, postJson } from '../lib/api'
import {
  planResponseSchema,
  plansResponseSchema,
  type Plan,
  type PlanForm,
} from './schemas'

export async function listPlans(): Promise<Plan[]> {
  const { plans } = await getJson('/admin/plans', plansResponseSchema)
  return plans
}

export async function createPlan(form: PlanForm): Promise<Plan> {
  const { plan } = await postJson('/admin/plans', planResponseSchema, form)
  return plan
}

export async function updatePlan(
  id: string,
  data: Partial<PlanForm> & { isActive?: boolean },
): Promise<Plan> {
  const { plan } = await patchJson(`/admin/plans/${id}`, planResponseSchema, data)
  return plan
}

/**
 * No existe DELETE de planes en la API: borrarlos rompería las suscripciones
 * que los referencian. Dar de baja = desactivar.
 */
export function deactivatePlan(id: string): Promise<Plan> {
  return updatePlan(id, { isActive: false })
}

export function activatePlan(id: string): Promise<Plan> {
  return updatePlan(id, { isActive: true })
}
