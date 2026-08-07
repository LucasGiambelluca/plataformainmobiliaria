import axios, {
  type AxiosError,
  type AxiosInstance,
  type InternalAxiosRequestConfig,
} from 'axios'
import type { ZodTypeAny, output } from 'zod'
import { authResponseSchema, type AuthResponse } from '../api/schemas'
import { toApiError } from './apiError'
import {
  getAccessToken,
  isImpersonating,
  notifyImpersonationEnded,
  notifySessionExpired,
  setAccessToken,
} from './session'

export const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api'

// `withCredentials` es obligatorio: la cookie de refresh es httpOnly y viaja
// sola. El backend habilita CORS con credentials para FRONTEND_URL.
const common = { baseURL: API_URL, withCredentials: true }

/** Cliente sin interceptores: lo usa el propio refresh para no recursar. */
const bare: AxiosInstance = axios.create(common)

export const api: AxiosInstance = axios.create(common)

interface RetriableConfig extends InternalAxiosRequestConfig {
  _retried?: boolean
}

api.interceptors.request.use((config) => {
  const token = getAccessToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Rutas que no deben disparar un refresh: si /auth/login da 401 es que las
// credenciales están mal, y si /auth/refresh da 401 la sesión ya murió.
const NO_REFRESH = ['/auth/login', '/auth/register', '/auth/refresh', '/auth/logout']

/**
 * Un solo refresh en vuelo. Es obligatorio, no una optimización: el backend
 * rota el refresh token y trata la reutilización de uno ya rotado como robo,
 * revocando TODAS las sesiones del usuario. Dos refresh concurrentes mandarían
 * la misma cookie y dispararían justo esa defensa.
 */
let inFlight: Promise<AuthResponse> | null = null

export function refreshSession(): Promise<AuthResponse> {
  if (!inFlight) {
    inFlight = bare
      .post('/auth/refresh')
      .then((res) => {
        const session = authResponseSchema.parse(res.data)
        setAccessToken(session.accessToken)
        return session
      })
      .finally(() => {
        inFlight = null
      })
  }
  return inFlight
}

/**
 * ¿El refresh falló porque la sesión terminó, o porque no se pudo preguntar?
 *
 * Solo un 401/403 significa que la cookie ya no vale. Un 429, un 5xx o un
 * corte de red son problemas de momento: cerrar la sesión ahí echa al usuario
 * de la aplicación por un pico de tráfico, y encima le hace perder lo que
 * estuviera escribiendo.
 */
export function sesionTerminada(err: unknown): boolean {
  const { status } = toApiError(err)
  return status === 401 || status === 403
}

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const config = error.config as RetriableConfig | undefined

    // Suplantando no se refresca. La cookie es la del super admin, así que
    // renovar lo devolvería a su identidad en medio de una pantalla del panel,
    // con el banner puesto y datos que ya no le corresponden. Se corta la
    // sesión de soporte y se avisa.
    if (error.response?.status === 401 && isImpersonating()) {
      notifyImpersonationEnded()
      throw toApiError(error)
    }

    const isExpiredAccess =
      error.response?.status === 401 &&
      config !== undefined &&
      !config._retried &&
      !NO_REFRESH.some((path) => config.url?.startsWith(path))

    if (isExpiredAccess) {
      config._retried = true
      try {
        await refreshSession()
        return await api(config)
      } catch (err) {
        // Solo se da la sesión por terminada si el backend dijo que la cookie
        // no vale. Ante un fallo pasajero la sesión sigue en pie y el próximo
        // pedido vuelve a intentar el refresh.
        if (sesionTerminada(err)) notifySessionExpired()
      }
    }

    throw toApiError(error)
  },
)

// Toda salida de estos helpers es un ApiError: las pantallas manejan un solo
// tipo de error, venga de la red, del backend o de un contrato que no coincide.
function parse<S extends ZodTypeAny>(schema: S, data: unknown): output<S> {
  try {
    return schema.parse(data) as output<S>
  } catch (err) {
    throw toApiError(err)
  }
}

/**
 * Pedidos validados. El schema documenta el contrato del backend y falla
 * ruidoso si la API cambia de forma, en vez de propagar `undefined` a la UI.
 *
 * El genérico va sobre el schema y no sobre el tipo, para que TypeScript use el
 * tipo de SALIDA: los schemas con transform tienen entrada y salida distintas.
 */
export async function getJson<S extends ZodTypeAny>(
  url: string,
  schema: S,
  params?: unknown,
): Promise<output<S>> {
  const res = await api.get(url, { params: params as Record<string, unknown> })
  return parse(schema, res.data)
}

export async function postJson<S extends ZodTypeAny>(
  url: string,
  schema: S,
  body?: unknown,
): Promise<output<S>> {
  const res = await api.post(url, body)
  return parse(schema, res.data)
}

export async function patchJson<S extends ZodTypeAny>(
  url: string,
  schema: S,
  body?: unknown,
): Promise<output<S>> {
  const res = await api.patch(url, body)
  return parse(schema, res.data)
}

export async function putJson<S extends ZodTypeAny>(
  url: string,
  schema: S,
  body?: unknown,
): Promise<output<S>> {
  const res = await api.put(url, body)
  return parse(schema, res.data)
}

/** Para endpoints 204 sin cuerpo. */
export async function postVoid(url: string, body?: unknown): Promise<void> {
  await api.post(url, body)
}
