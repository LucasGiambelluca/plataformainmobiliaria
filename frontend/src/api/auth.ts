import { api, postJson } from '../lib/api'
import {
  authResponseSchema,
  registerResponseSchema,
  type AuthResponse,
  type RegisterForm,
  type RegisterResponse,
} from './schemas'

export function login(email: string, password: string): Promise<AuthResponse> {
  return postJson('/auth/login', authResponseSchema, { email, password })
}

/** Alta self-serve: crea la inmobiliaria + su usuario admin y deja la sesión abierta. */
export function register(form: RegisterForm): Promise<RegisterResponse> {
  return postJson('/auth/register', registerResponseSchema, {
    tenantName: form.tenantName,
    slug: form.slug,
    email: form.email,
    password: form.password,
    // El backend rechaza name vacío: se omite en vez de mandar "".
    ...(form.name ? { name: form.name } : {}),
  })
}

export async function logout(): Promise<void> {
  // Idempotente del lado del backend: si la cookie ya no está, igual responde 204.
  await api.post('/auth/logout')
}
