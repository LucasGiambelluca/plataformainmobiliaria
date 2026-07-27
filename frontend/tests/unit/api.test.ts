import { beforeEach, describe, expect, it } from 'vitest'
import { api, getJson, refreshSession } from '../../src/lib/api'
import { ApiError } from '../../src/lib/apiError'
import { getAccessToken, setAccessToken, setSessionExpiredHandler } from '../../src/lib/session'
import { plansResponseSchema } from '../../src/api/schemas'
import { useMockServer, type MockServer } from '../helpers/mockServer'

const USER = {
  id: 'u1',
  tenantId: 't1',
  email: 'ana@norte.com',
  role: 'tenant_admin',
  name: 'Ana',
}

const backendError = (code: string, message: string, details?: unknown) => ({
  error: { code, message, ...(details ? { details } : {}) },
})

let server: MockServer

beforeEach(() => {
  server = useMockServer()
  // El estado de sesión vive a nivel de módulo: se limpia entre tests.
  setAccessToken(null)
  setSessionExpiredHandler(null)
})

describe('token de acceso', () => {
  it('manda el access token en el header Authorization', async () => {
    setAccessToken('token-vigente')
    server.on('get', '/subscription', { status: 200, data: { ok: true } })

    await api.get('/subscription')

    expect(server.callsTo('get', '/subscription')[0].authorization).toBe('Bearer token-vigente')
  })

  it('no manda Authorization cuando no hay sesión', async () => {
    server.on('get', '/subscription', { status: 200, data: { ok: true } })

    await api.get('/subscription')

    expect(server.callsTo('get', '/subscription')[0].authorization).toBeUndefined()
  })
})

describe('refresh ante 401', () => {
  it('refresca y reintenta la request original con el token nuevo', async () => {
    setAccessToken('token-vencido')
    server
      .on('get', '/admin/plans', { status: 401 }, { status: 200, data: { plans: [] } })
      .on('post', '/auth/refresh', {
        status: 200,
        data: { user: USER, accessToken: 'token-nuevo' },
      })

    const res = await api.get('/admin/plans')

    expect(res.data).toEqual({ plans: [] })
    expect(server.countOf('post', '/auth/refresh')).toBe(1)

    const intentos = server.callsTo('get', '/admin/plans')
    expect(intentos).toHaveLength(2)
    expect(intentos[0].authorization).toBe('Bearer token-vencido')
    expect(intentos[1].authorization).toBe('Bearer token-nuevo')
    expect(getAccessToken()).toBe('token-nuevo')
  })

  it('hace un solo refresh para varios 401 concurrentes', async () => {
    // Regresión: el backend rota el refresh token y trata la reutilización como
    // robo, revocando TODAS las sesiones. Dos refresh en paralelo mandarían la
    // misma cookie y dispararían esa defensa.
    setAccessToken('token-vencido')
    server
      .on(
        'get',
        '/admin/tenants',
        { status: 401 },
        { status: 401 },
        { status: 401 },
        { status: 200, data: { items: [] } },
      )
      .on('post', '/auth/refresh', {
        status: 200,
        data: { user: USER, accessToken: 'token-nuevo' },
      })

    const resultados = await Promise.all([
      api.get('/admin/tenants'),
      api.get('/admin/tenants'),
      api.get('/admin/tenants'),
    ])

    expect(server.countOf('post', '/auth/refresh')).toBe(1)
    expect(resultados.map((r) => r.data)).toEqual([
      { items: [] },
      { items: [] },
      { items: [] },
    ])
  })

  it('no refresca dos veces la misma request si el reintento también da 401', async () => {
    setAccessToken('token-vencido')
    server
      .on('get', '/admin/plans', { status: 401 })
      .on('post', '/auth/refresh', {
        status: 200,
        data: { user: USER, accessToken: 'token-nuevo' },
      })

    await expect(api.get('/admin/plans')).rejects.toBeInstanceOf(ApiError)

    expect(server.countOf('post', '/auth/refresh')).toBe(1)
    expect(server.countOf('get', '/admin/plans')).toBe(2)
  })

  it('no intenta refrescar cuando el que falla es el login', async () => {
    server.on('post', '/auth/login', {
      status: 401,
      data: backendError('UNAUTHORIZED', 'Credenciales inválidas'),
    })

    const err = await api.post('/auth/login', {}).catch((e: unknown) => e)

    expect(err).toBeInstanceOf(ApiError)
    expect((err as ApiError).message).toBe('Credenciales inválidas')
    expect(server.countOf('post', '/auth/refresh')).toBe(0)
  })

  it('cierra la sesión si el refresh también falla', async () => {
    setAccessToken('token-vencido')
    let expirada = false
    setSessionExpiredHandler(() => {
      expirada = true
    })
    server
      .on('get', '/subscription', { status: 401 })
      .on('post', '/auth/refresh', {
        status: 401,
        data: backendError('UNAUTHORIZED', 'Refresh token inválido o expirado'),
      })

    const err = await api.get('/subscription').catch((e: unknown) => e)

    expect(expirada).toBe(true)
    expect(getAccessToken()).toBeNull()
    // Se propaga el 401 original, no el del refresh.
    expect((err as ApiError).status).toBe(401)
    expect(server.countOf('get', '/subscription')).toBe(1)
  })

  it('refreshSession concurrente hace un solo pedido', async () => {
    server.on('post', '/auth/refresh', {
      status: 200,
      data: { user: USER, accessToken: 'token-nuevo' },
    })

    await Promise.all([refreshSession(), refreshSession(), refreshSession()])

    expect(server.countOf('post', '/auth/refresh')).toBe(1)
  })

  it('permite un refresh nuevo después de que el anterior terminó', async () => {
    server.on('post', '/auth/refresh', {
      status: 200,
      data: { user: USER, accessToken: 'token-nuevo' },
    })

    await refreshSession()
    await refreshSession()

    // Secuencial no es reutilización: cada uno manda la cookie que le tocó.
    expect(server.countOf('post', '/auth/refresh')).toBe(2)
  })
})

describe('normalización de errores', () => {
  it('traduce el cuerpo de error del backend a ApiError', async () => {
    server.on('post', '/admin/plans', {
      status: 422,
      data: backendError('VALIDATION_ERROR', 'Error de validación', [
        { path: 'slug', message: 'Slug inválido' },
      ]),
    })

    const err = (await api.post('/admin/plans', {}).catch((e: unknown) => e)) as ApiError

    expect(err).toBeInstanceOf(ApiError)
    expect(err.code).toBe('VALIDATION_ERROR')
    expect(err.status).toBe(422)
    expect(err.issueFor('slug')).toBe('Slug inválido')
  })

  it('reporta la caída de red como NETWORK_ERROR', async () => {
    server.on('get', '/subscription', { status: 0, networkError: true })

    const err = (await api.get('/subscription').catch((e: unknown) => e)) as ApiError

    expect(err.code).toBe('NETWORK_ERROR')
    expect(err.message).toMatch(/No se pudo conectar/)
  })

  it('marca CONTRACT_MISMATCH si la respuesta no cumple el schema', async () => {
    server.on('get', '/admin/plans', { status: 200, data: { plans: [{ id: 'p1' }] } })

    const err = (await getJson('/admin/plans', plansResponseSchema).catch(
      (e: unknown) => e,
    )) as ApiError

    expect(err).toBeInstanceOf(ApiError)
    expect(err.code).toBe('CONTRACT_MISMATCH')
  })
})

describe('helpers validados', () => {
  it('devuelve el dato ya parseado por el schema', async () => {
    server.on('get', '/admin/plans', {
      status: 200,
      data: {
        plans: [
          {
            id: 'p1',
            name: 'Pro',
            slug: 'pro',
            // El Decimal de Prisma puede llegar como número: el schema lo
            // normaliza a string para no perder precisión con plata.
            priceAmount: 59900,
            priceCurrency: 'ARS',
            billingInterval: 'monthly',
            maxProperties: 100,
            maxUsers: 10,
            maxStorageMb: 20480,
            isActive: true,
          },
        ],
      },
    })

    const { plans } = await getJson('/admin/plans', plansResponseSchema)

    expect(plans[0].priceAmount).toBe('59900')
  })
})
