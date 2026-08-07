import { beforeEach, describe, expect, it } from 'vitest'
import {
  getAccessToken,
  isImpersonating,
  setAccessToken,
  setImpersonating,
} from '../../src/lib/session'
import { useAuth } from '../../src/store/auth'
import { useMockServer, type MockServer } from '../helpers/mockServer'

const ADMIN = {
  id: 'sa-1',
  tenantId: null,
  email: 'admin@plataforma.com',
  role: 'super_admin' as const,
  name: 'Super Admin',
}

const SUPLANTADO = {
  id: 'ta-1',
  tenantId: 't-1',
  email: 'ana@demo.com',
  role: 'tenant_admin' as const,
  name: 'Ana',
}

const TENANT = { id: 't-1', name: 'Inmobiliaria Demo', slug: 'demo' }
const EXPIRA = '2026-08-06T18:30:00.000Z'

let server: MockServer

beforeEach(() => {
  server = useMockServer()
  setAccessToken(null)
  setImpersonating(false)
  useAuth.setState({ user: ADMIN, status: 'authenticated', impersonation: null })
})

describe('startImpersonation', () => {
  it('deja el token de soporte y la inmobiliaria en el store', async () => {
    server.on('post', '/admin/tenants/t-1/impersonate', {
      status: 200,
      data: {
        accessToken: 'token-de-soporte',
        expiresAt: EXPIRA,
        user: SUPLANTADO,
        tenant: TENANT,
      },
    })

    await useAuth.getState().startImpersonation('t-1')

    expect(getAccessToken()).toBe('token-de-soporte')
    expect(isImpersonating()).toBe(true)
    expect(useAuth.getState().user).toEqual(SUPLANTADO)
    expect(useAuth.getState().impersonation).toEqual({
      tenant: TENANT,
      expiresAt: EXPIRA,
    })
  })
})

describe('stopImpersonation', () => {
  it('vuelve al super admin con la cookie, que nunca dejó de ser suya', async () => {
    setAccessToken('token-de-soporte')
    setImpersonating(true)
    useAuth.setState({
      user: SUPLANTADO,
      status: 'authenticated',
      impersonation: { tenant: TENANT, expiresAt: EXPIRA },
    })
    server.on('post', '/auth/refresh', {
      status: 200,
      data: { user: ADMIN, accessToken: 'token-admin' },
    })

    await useAuth.getState().stopImpersonation()

    expect(useAuth.getState().user).toEqual(ADMIN)
    expect(useAuth.getState().impersonation).toBeNull()
    expect(isImpersonating()).toBe(false)
    expect(getAccessToken()).toBe('token-admin')
  })

  it('deja la sesión anónima si la del super admin también murió', async () => {
    setAccessToken('token-de-soporte')
    setImpersonating(true)
    useAuth.setState({
      user: SUPLANTADO,
      status: 'authenticated',
      impersonation: { tenant: TENANT, expiresAt: EXPIRA },
    })
    server.on('post', '/auth/refresh', { status: 401, data: {} })

    await expect(useAuth.getState().stopImpersonation()).rejects.toBeDefined()

    expect(useAuth.getState().impersonation).toBeNull()
  })
})
