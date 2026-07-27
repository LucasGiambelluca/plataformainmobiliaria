import { beforeEach, describe, expect, it } from 'vitest'
import { api } from '../../src/lib/api'
import { getAccessToken, setAccessToken } from '../../src/lib/session'
import { homeFor, useAuth } from '../../src/store/auth'
import { useMockServer, type MockServer } from '../helpers/mockServer'

const ADMIN = {
  id: 'u0',
  tenantId: null,
  email: 'admin@plataforma.com',
  role: 'super_admin' as const,
  name: 'Super Admin',
}

const TENANT_ADMIN = {
  id: 'u1',
  tenantId: 't1',
  email: 'ana@norte.com',
  role: 'tenant_admin' as const,
  name: 'Ana',
}

let server: MockServer

beforeEach(() => {
  server = useMockServer()
  setAccessToken(null)
  useAuth.setState({ user: null, status: 'loading' })
})

describe('bootstrap', () => {
  it('rehidrata la sesión con la cookie de refresh', async () => {
    server.on('post', '/auth/refresh', {
      status: 200,
      data: { user: TENANT_ADMIN, accessToken: 'token-nuevo' },
    })

    await useAuth.getState().bootstrap()

    expect(useAuth.getState().status).toBe('authenticated')
    expect(useAuth.getState().user).toEqual(TENANT_ADMIN)
    expect(getAccessToken()).toBe('token-nuevo')
  })

  it('hace un solo POST /auth/refresh si se lo llama dos veces en paralelo', async () => {
    // Regresión de StrictMode: React monta el efecto dos veces en desarrollo.
    // Dos refresh con la misma cookie hacen que el backend revoque la sesión
    // entera por detección de reutilización.
    server.on('post', '/auth/refresh', {
      status: 200,
      data: { user: TENANT_ADMIN, accessToken: 'token-nuevo' },
    })

    const { bootstrap } = useAuth.getState()
    await Promise.all([bootstrap(), bootstrap()])

    expect(server.countOf('post', '/auth/refresh')).toBe(1)
    expect(useAuth.getState().status).toBe('authenticated')
  })

  it('deja la sesión anónima si no hay cookie válida, sin propagar el error', async () => {
    server.on('post', '/auth/refresh', {
      status: 401,
      data: { error: { code: 'UNAUTHORIZED', message: 'Falta el refresh token' } },
    })

    await expect(useAuth.getState().bootstrap()).resolves.toBeUndefined()

    expect(useAuth.getState().status).toBe('anonymous')
    expect(useAuth.getState().user).toBeNull()
    expect(getAccessToken()).toBeNull()
  })
})

describe('login y logout', () => {
  it('login deja usuario y token en memoria', async () => {
    server.on('post', '/auth/login', {
      status: 200,
      data: { user: ADMIN, accessToken: 'token-admin' },
    })

    const user = await useAuth.getState().login('admin@plataforma.com', 'secret123')

    expect(user).toEqual(ADMIN)
    expect(useAuth.getState().status).toBe('authenticated')
    expect(getAccessToken()).toBe('token-admin')
  })

  it('logout limpia la sesión local aunque el backend falle', async () => {
    setAccessToken('token-admin')
    useAuth.setState({ user: ADMIN, status: 'authenticated' })
    server.on('post', '/auth/logout', { status: 500, data: {} })

    await expect(useAuth.getState().logout()).rejects.toBeDefined()

    expect(useAuth.getState().status).toBe('anonymous')
    expect(useAuth.getState().user).toBeNull()
    expect(getAccessToken()).toBeNull()
  })
})

describe('expiración de sesión', () => {
  it('pasa el store a anónimo cuando el refresh falla en medio de la navegación', async () => {
    setAccessToken('token-vencido')
    useAuth.setState({ user: TENANT_ADMIN, status: 'authenticated' })
    server
      .on('get', '/subscription', { status: 401 })
      .on('post', '/auth/refresh', { status: 401, data: {} })

    await expect(api.get('/subscription')).rejects.toBeDefined()

    expect(useAuth.getState().status).toBe('anonymous')
    expect(useAuth.getState().user).toBeNull()
  })
})

describe('homeFor', () => {
  it('manda al super admin a /admin y al resto a /panel', () => {
    expect(homeFor(ADMIN)).toBe('/admin')
    expect(homeFor(TENANT_ADMIN)).toBe('/panel')
    expect(homeFor({ ...TENANT_ADMIN, role: 'agent' })).toBe('/panel')
  })
})
