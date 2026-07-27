import axios from 'axios'
import { ZodError } from 'zod'

export interface FieldIssue {
  path: string
  message: string
}

/**
 * Error normalizado de la API. El backend siempre responde
 * `{ error: { code, message, details? } }` (ver shared/middleware/error.ts),
 * así que toda pantalla puede mostrar `err.message` sin adivinar la forma.
 */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
    readonly issues: FieldIssue[] = [],
  ) {
    super(message)
    this.name = 'ApiError'
  }

  /** Mensaje del primer problema de validación de un campo, si lo hay. */
  issueFor(path: string): string | undefined {
    return this.issues.find((i) => i.path === path)?.message
  }
}

interface BackendErrorBody {
  error?: {
    code?: unknown
    message?: unknown
    details?: unknown
  }
}

function parseIssues(details: unknown): FieldIssue[] {
  if (!Array.isArray(details)) return []
  return details.flatMap((d) => {
    if (typeof d !== 'object' || d === null) return []
    const { path, message } = d as Record<string, unknown>
    if (typeof path !== 'string' || typeof message !== 'string') return []
    return [{ path, message }]
  })
}

export function toApiError(err: unknown): ApiError {
  if (err instanceof ApiError) return err

  // Respuesta del backend fuera del rango 2xx.
  if (axios.isAxiosError(err)) {
    const body = err.response?.data as BackendErrorBody | undefined
    const backend = body?.error

    if (!err.response) {
      return new ApiError(
        'No se pudo conectar con el servidor. ¿Está corriendo el backend?',
        'NETWORK_ERROR',
        0,
      )
    }

    return new ApiError(
      typeof backend?.message === 'string' ? backend.message : 'Error inesperado del servidor',
      typeof backend?.code === 'string' ? backend.code : 'UNKNOWN',
      err.response.status,
      parseIssues(backend?.details),
    )
  }

  // La respuesta llegó pero no coincide con el contrato esperado: es un bug
  // nuestro o del backend, no un error del usuario. Se hace visible.
  if (err instanceof ZodError) {
    return new ApiError(
      'La respuesta del servidor no tiene el formato esperado',
      'CONTRACT_MISMATCH',
      0,
      err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    )
  }

  return new ApiError(
    err instanceof Error ? err.message : 'Error desconocido',
    'UNKNOWN',
    0,
  )
}
