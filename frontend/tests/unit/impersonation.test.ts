import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../../src/lib/api'
import {
  getAccessToken,
  setAccessToken,
  setImpersonating,
  setImpersonationEndedHandler,
} from '../../src/lib/session'
import { useMockServer, type MockServer } from '../helpers/mockServer'

let server: MockServer

beforeEach(() => {
  server = useMockServer()
  // El estado vive a nivel de módulo: si no se resetea, se filtra entre tests.
  setAccessToken(null)
  setImpersonating(false)
  setImpersonationEndedHandler(null)
})

describe('401 durante una suplantación', () => {
  it('no dispara refresh: corta la sesión de soporte', async () => {
    // Refrescar devolvería al super admin a su identidad en medio de una
    // pantalla del panel, con el banner puesto y datos de otra inmobiliaria.
    setAccessToken('token-de-soporte')
    setImpersonating(true)
    const terminada = vi.fn()
    setImpersonationEndedHandler(terminada)
    server.on('get', '/properties', { status: 401 })

    await expect(api.get('/properties')).rejects.toBeDefined()

    expect(server.countOf('post', '/auth/refresh')).toBe(0)
    expect(terminada).toHaveBeenCalledTimes(1)
    expect(getAccessToken()).toBeNull()
  })

  it('fuera de la suplantación el 401 sigue refrescando como siempre', async () => {
    setAccessToken('token-vencido')
    server
      .on('get', '/properties', { status: 401 }, { status: 200, data: { items: [] } })
      .on('post', '/auth/refresh', {
        status: 200,
        data: {
          user: {
            id: 'u1',
            tenantId: 't1',
            email: 'a@b.com',
            role: 'tenant_admin',
            name: 'Ana',
          },
          accessToken: 'token-nuevo',
        },
      })

    await expect(api.get('/properties')).resolves.toBeDefined()

    expect(server.countOf('post', '/auth/refresh')).toBe(1)
  })
})
