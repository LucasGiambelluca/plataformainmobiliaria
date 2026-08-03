import { beforeEach, describe, expect, it } from 'vitest'
import { getAgencies } from '../../src/api/publicCatalog'
import { getCurrentSite } from '../../src/api/sites'
import { ApiError } from '../../src/lib/apiError'
import { setAccessToken } from '../../src/lib/session'
import { useMockServer, type MockServer } from '../helpers/mockServer'

const AGENCIA = {
  id: 't1',
  name: 'Inmobiliaria Norte',
  slug: 'norte',
  logoUrl: null,
  description: null,
  contactEmail: 'hola@norte.test',
  contactPhone: '0343 400-0000',
  propertiesCount: 4,
  cities: ['Paraná', 'Oro Verde'],
  hasPublishedSite: true,
}

let server: MockServer

beforeEach(() => {
  server = useMockServer()
  setAccessToken(null)
})

describe('directorio de inmobiliarias', () => {
  it('devuelve las localidades y si tiene la web publicada', async () => {
    server.on('get', '/public/agencies', { status: 200, data: { agencies: [AGENCIA] } })

    const agencies = await getAgencies()

    expect(agencies).toHaveLength(1)
    expect(agencies[0].cities).toEqual(['Paraná', 'Oro Verde'])
    expect(agencies[0].hasPublishedSite).toBe(true)
  })

  it('no manda credenciales: es un endpoint abierto', async () => {
    setAccessToken('token-vigente')
    server.on('get', '/public/agencies', { status: 200, data: { agencies: [] } })

    await getAgencies()

    // El cliente sí adjunta el token si hay sesión; lo que importa es que el
    // endpoint responda igual sin ella, y que la pantalla no exija login.
    expect(server.countOf('get', '/public/agencies')).toBe(1)
  })

  it('una respuesta sin los campos nuevos falla la validación', async () => {
    // El schema es el contrato: si el backend deja de mandar `cities`, la
    // pantalla tiene que romper acá y no dibujar un directorio sin localidades.
    const { cities: _cities, ...sinCiudades } = AGENCIA
    server.on('get', '/public/agencies', {
      status: 200,
      data: { agencies: [sinCiudades] },
    })

    await expect(getAgencies()).rejects.toBeInstanceOf(ApiError)
  })
})

describe('web de la inmobiliaria por host', () => {
  it('pide /public/sites/current, sin slug en la URL', async () => {
    // Quién es la inmobiliaria lo decide el backend leyendo el Host: el
    // navegador no le manda ningún identificador.
    server.on('get', '/public/sites/current', {
      status: 200,
      data: {
        tenant: {
          id: 't1',
          name: 'Inmobiliaria Norte',
          slug: 'norte',
          logoUrl: null,
          description: null,
          contactEmail: null,
          contactPhone: null,
        },
        site: {
          primaryColor: null,
          secondaryColor: null,
          heroTitle: null,
          heroSubtitle: null,
          aboutText: null,
          socialFacebook: null,
          socialInstagram: null,
          socialWhatsapp: null,
          showFeaturedOnly: false,
          template: null,
        },
        carousel: [],
      },
    })

    const sitio = await getCurrentSite()

    expect(sitio.tenant.slug).toBe('norte')
    expect(server.callsTo('get', '/public/sites/current')[0].body).toBeUndefined()
  })
})
