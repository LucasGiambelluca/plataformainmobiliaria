import { beforeEach, describe, expect, it } from 'vitest'
import { getLocalidades } from '../../src/api/publicCatalog'
import { appraisalFormSchema, propertyFormSchema } from '../../src/api/schemas'
import { setAccessToken } from '../../src/lib/session'
import { useMockServer, type MockServer } from '../helpers/mockServer'

/**
 * El catálogo de localidades vive en el backend y este lado no lo repite: si
 * estuviera escrito acá y divergiera, el desplegable ofrecería una localidad
 * que el servidor rechaza con 422. Estos tests fijan que se baja, no cuál es
 * su contenido.
 */

const LOCALIDADES = ['Concordia', 'Oro Verde', 'Paraná']

let server: MockServer

beforeEach(() => {
  server = useMockServer()
  setAccessToken(null)
})

describe('getLocalidades', () => {
  it('trae el catálogo del backend', async () => {
    server.on('get', '/public/localidades', {
      status: 200,
      data: { localidades: LOCALIDADES },
    })

    await expect(getLocalidades()).resolves.toEqual(LOCALIDADES)
  })

  it('no manda Authorization: lo usa el formulario público de tasación', async () => {
    server.on('get', '/public/localidades', {
      status: 200,
      data: { localidades: LOCALIDADES },
    })

    await getLocalidades()

    expect(server.callsTo('get', '/public/localidades')[0].authorization).toBeUndefined()
  })

  it('es un endpoint distinto de /public/cities', async () => {
    // `cities` son las localidades CON propiedades publicadas, con su conteo, y
    // sirve para filtrar. El alta necesita el catálogo completo, incluidas las
    // localidades donde todavía no publicó nadie.
    server.on('get', '/public/localidades', {
      status: 200,
      data: { localidades: LOCALIDADES },
    })

    await getLocalidades()

    expect(server.callsTo('get', '/public/cities')).toHaveLength(0)
  })
})

const PROPIEDAD = {
  title: 'Casa 3 ambientes',
  propertyType: 'house',
  operationType: 'sale',
  price: '185000.00',
  currency: 'USD',
  city: 'Paraná',
}

describe('propertyFormSchema - localidad', () => {
  it('acepta el alta con localidad', () => {
    expect(propertyFormSchema.parse(PROPIEDAD).city).toBe('Paraná')
  })

  it('no pide la provincia: se deduce de la localidad', () => {
    // Las 71 del catálogo son de Entre Ríos, así que el campo salió del alta.
    // Si alguien lo manda igual, Zod lo descarta en vez de guardarlo.
    const parsed = propertyFormSchema.parse({ ...PROPIEDAD, state: 'Santa Fe' })
    expect(parsed).not.toHaveProperty('state')
  })

  it('rechaza el alta sin localidad antes de ir al servidor', () => {
    for (const city of ['', '   ', undefined]) {
      const r = propertyFormSchema.safeParse({ ...PROPIEDAD, city })
      expect(r.success).toBe(false)
    }
  })
})

const TASACION = {
  name: 'Ana Pérez',
  phone: '0343 400-0000',
  email: 'ana@example.com',
  city: 'Concordia',
  address: 'San Martín 500',
  propertyType: 'house',
  purpose: 'sale',
  declaredAccurate: true,
  acceptedTerms: true,
}

describe('appraisalFormSchema - localidad', () => {
  it('acepta la solicitud con localidad', () => {
    expect(appraisalFormSchema.parse(TASACION).city).toBe('Concordia')
  })

  it('rechaza la solicitud sin localidad', () => {
    const r = appraisalFormSchema.safeParse({ ...TASACION, city: '' })
    expect(r.success).toBe(false)
  })
})
