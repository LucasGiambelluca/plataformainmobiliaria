import { getJson, postVoid } from '../lib/api'
import {
  subscriptionStatusResponseSchema,
  type SubscriptionStatusResponse,
} from './schemas'

/** Plan vigente del tenant + uso real contra los límites del plan. */
export function getSubscription(): Promise<SubscriptionStatusResponse> {
  return getJson('/subscription', subscriptionStatusResponseSchema)
}

/** Cancela al fin del período; no corta el servicio en el momento. */
export function cancelSubscription(): Promise<void> {
  return postVoid('/subscription/cancel')
}
