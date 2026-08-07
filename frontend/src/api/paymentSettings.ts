import { getJson, postJson, putJson } from '../lib/api'
import {
  activateModeResponseSchema,
  paymentSettingsSchema,
  saveCredentialsResponseSchema,
  type ActivateModeResponse,
  type PaymentCredentialsForm,
  type PaymentMode,
  type PaymentSettings,
} from './schemas'

export function getPaymentSettings(): Promise<PaymentSettings> {
  return getJson('/admin/payment-settings', paymentSettingsSchema)
}

/**
 * Guarda un juego de credenciales. Los dos campos van siempre: no hay
 * actualización parcial de campos que no se pueden leer.
 */
export function savePaymentCredentials(
  mode: PaymentMode,
  form: PaymentCredentialsForm,
): Promise<{ verified: boolean; last4: string }> {
  return putJson(`/admin/payment-settings/${mode}`, saveCredentialsResponseSchema, form)
}

export function activatePaymentMode(mode: PaymentMode): Promise<ActivateModeResponse> {
  return postJson('/admin/payment-settings/activate', activateModeResponseSchema, { mode })
}
