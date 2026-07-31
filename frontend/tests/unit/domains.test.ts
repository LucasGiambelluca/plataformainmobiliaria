import { beforeEach, describe, expect, it } from 'vitest'
import {
  addDomain,
  deleteDomain,
  listAllDomains,
  listDomains,
  verifyDomain,
} from '../../src/api/domains'
import { domainFormSchema } from '../../src/api/schemas'
import { ApiError } from '../../src/lib/apiError'
import { setAccessToken, setSessionExpiredHandler } from '../../src/lib/session'
import { useMockServer, type MockServer } from '../helpers/mockServer'

const DOMAIN_ID = 'dom-1'

const domainRow = (overrides: Record<string, unknown> = {}) => ({
  id: DOMAIN_ID,
  tenantId: 't-1',
  domain: 'inmobiliarianorte.com',
  status: 'pending',
  dnsTarget: 'edge.plataforma.com',
  lastCheckedAt: null,
  verifiedAt: null,
  createdAt: '2026-07-30T10:00:00.000Z',
  ...overrides,
})

let server: MockServer

beforeEach(() => {
  server = useMockServer()
  setAccessToken('token-vigente')
  setSessionExpiredHandler(null)
})

describe('domainFormSchema', () => {
  it('limpia la URL pegada del navegador', () => {
    const parsed = domainFormSchema.parse({ domain: '  HTTPS://Midominio.com/inicio  ' })
    expect(parsed.domain).toBe('midominio.com')
  })

  it('rechaza lo que no es un hostname', () => {
    for (const domain of ['sin-tld', '*.comodin.com', 'con espacio.com', '']) {
      expect(domainFormSchema.safeParse({ domain }).success).toBe(false)
    }
  })
})

describe('listDomains', () => {
  it('devuelve los dominios junto al destino del DNS', () => {
    // El panel muestra qué configurar antes de que exista el primer dominio.
    server.on('get', '/domains', {
      status: 200,
      data: { domains: [domainRow()], dnsTarget: 'edge.plataforma.com' },
    })

    return expect(listDomains()).resolves.toEqual({
      domains: [domainRow()],
      dnsTarget: 'edge.plataforma.com',
    })
  })
})

describe('addDomain', () => {
  it('manda el dominio y devuelve la fila creada', async () => {
    server.on('post', '/domains', { status: 201, data: { domain: domainRow() } })

    const created = await addDomain('inmobiliarianorte.com')

    expect(created.id).toBe(DOMAIN_ID)
    expect(server.callsTo('post', '/domains')[0].body).toEqual({
      domain: 'inmobiliarianorte.com',
    })
  })

  it('sin cupo en el plan, el 402 llega como ApiError legible', async () => {
    server.on('post', '/domains', {
      status: 402,
      data: {
        error: {
          code: 'LIMIT_EXCEEDED',
          message: 'Se alcanzó el límite del plan para: dominios',
        },
      },
    })

    await expect(addDomain('otro.com')).rejects.toBeInstanceOf(ApiError)
  })
})

describe('verifyDomain', () => {
  it('devuelve el estado real y el motivo cuando no pasó', async () => {
    // El backend no dice "ok, lo intentamos": dice a dónde apunta hoy.
    server.on('post', `/domains/${DOMAIN_ID}/verify`, {
      status: 200,
      data: {
        domain: domainRow({ status: 'failed', lastCheckedAt: '2026-07-31T10:00:00.000Z' }),
        detail: 'inmobiliarianorte.com apunta a otro-hosting.com en vez de edge.plataforma.com.',
      },
    })

    const res = await verifyDomain(DOMAIN_ID)

    expect(res.domain.status).toBe('failed')
    expect(res.detail).toContain('otro-hosting.com')
  })
})

describe('deleteDomain', () => {
  it('pega al endpoint del tenant, no al global', async () => {
    server.on('delete', `/domains/${DOMAIN_ID}`, { status: 204 })

    await deleteDomain(DOMAIN_ID)

    expect(server.countOf('delete', `/domains/${DOMAIN_ID}`)).toBe(1)
    expect(server.countOf('delete', `/admin/domains/${DOMAIN_ID}`)).toBe(0)
  })
})

describe('listAllDomains', () => {
  it('manda solo los filtros cargados', async () => {
    server.on('get', '/admin/domains', {
      status: 200,
      data: {
        items: [{ ...domainRow(), tenantName: 'Inmobiliaria Norte', tenantSlug: 'norte' }],
        total: 1,
        page: 1,
        pageSize: 25,
      },
    })

    const res = await listAllDomains({ status: 'active', page: 1 })

    expect(res.items[0].tenantName).toBe('Inmobiliaria Norte')
  })
})
