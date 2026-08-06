import { beforeEach, describe, expect, it } from 'vitest'
import {
  createAppraisal,
  listAppraisalParticipants,
  listMyAppraisals,
  updateAppraisalStatus,
} from '../../src/api/appraisals'
import { appraisalFormSchema } from '../../src/api/schemas'
import { ApiError } from '../../src/lib/apiError'
import { setAccessToken, setSessionExpiredHandler } from '../../src/lib/session'
import { useMockServer, type MockServer } from '../helpers/mockServer'

const AGENCIA = {
  id: '11111111-1111-1111-1111-111111111111',
  name: 'Norte',
  slug: 'norte',
  logoUrl: null,
}

const BASE_FORM = {
  name: 'Ana Pérez',
  phone: '+54 343 555 0000',
  email: 'ana@example.com',
  city: 'Paraná',
  address: 'San Martín 123',
  propertyType: 'house',
  purpose: 'sale',
  declaredAccurate: true,
  acceptedTerms: true,
}

let server: MockServer

beforeEach(() => {
  server = useMockServer()
  setAccessToken(null)
  setSessionExpiredHandler(null)
})

describe('listAppraisalParticipants', () => {
  it('trae las inmobiliarias que participan, sin sesión', async () => {
    server.on('get', '/public/appraisals/participants', {
      status: 200,
      data: { agencies: [AGENCIA] },
    })

    const agencies = await listAppraisalParticipants()

    expect(agencies).toHaveLength(1)
    expect(agencies[0].name).toBe('Norte')
    expect(
      server.callsTo('get', '/public/appraisals/participants')[0].authorization,
    ).toBeUndefined()
  })

  it('puede acotar por localidad', async () => {
    server.on('get', '/public/appraisals/participants', {
      status: 200,
      data: { agencies: [] },
    })

    const agencies = await listAppraisalParticipants('Paraná')

    expect(agencies).toEqual([])
  })
})

describe('createAppraisal', () => {
  it('manda la solicitud y avisa si quedó asignada', async () => {
    server.on('post', '/public/appraisals', {
      status: 201,
      data: { ok: true, assigned: true },
    })

    const r = await createAppraisal({ ...BASE_FORM } as never)

    expect(r.assigned).toBe(true)
  })

  it('normaliza el 422 del backend como ApiError', async () => {
    server.on('post', '/public/appraisals', {
      status: 422,
      data: {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'La inmobiliaria elegida ya no está participando del servicio',
        },
      },
    })

    const err = await createAppraisal({ ...BASE_FORM } as never).catch(
      (e: unknown) => e,
    )

    expect(err).toBeInstanceOf(ApiError)
    expect((err as ApiError).message).toMatch(/ya no está participando/)
  })
})

describe('bandeja de la inmobiliaria', () => {
  it('pide las solicitudes propias con la sesión puesta', async () => {
    setAccessToken('token-vigente')
    server.on('get', '/appraisals', { status: 200, data: { items: [], total: 0 } })

    const r = await listMyAppraisals({})

    expect(r.total).toBe(0)
    expect(server.callsTo('get', '/appraisals')[0].authorization).toBe(
      'Bearer token-vigente',
    )
  })

  it('cambia el estado de una solicitud', async () => {
    setAccessToken('token-vigente')
    server.on('patch', '/appraisals/ap-1', {
      status: 200,
      data: {
        appraisal: {
          id: 'ap-1',
          tenantId: '11111111-1111-1111-1111-111111111111',
          name: 'Ana',
          phone: '123',
          email: 'a@b.com',
          city: 'Paraná',
          neighborhood: null,
          address: 'San Martín 123',
          propertyType: 'house',
          purpose: 'sale',
          areaM2: null,
          rooms: null,
          bathrooms: null,
          condition: null,
          comments: null,
          details: null,
          status: 'contacted',
          assignedAutomatically: true,
          assignedAt: '2026-08-04T12:00:00.000Z',
          createdAt: '2026-08-04T12:00:00.000Z',
        },
      },
    })

    const r = await updateAppraisalStatus('ap-1', 'contacted')

    expect(r.status).toBe('contacted')
  })
})

describe('appraisalFormSchema', () => {
  it('acepta el formulario mínimo', () => {
    expect(appraisalFormSchema.safeParse(BASE_FORM).success).toBe(true)
  })

  it('exige tildar los dos consentimientos', () => {
    for (const campo of ['declaredAccurate', 'acceptedTerms'] as const) {
      const r = appraisalFormSchema.safeParse({ ...BASE_FORM, [campo]: false })
      expect(r.success).toBe(false)
    }
  })

  it('exige teléfono', () => {
    const r = appraisalFormSchema.safeParse({ ...BASE_FORM, phone: '' })
    expect(r.success).toBe(false)
  })

  it('rechaza un correo mal escrito', () => {
    const r = appraisalFormSchema.safeParse({ ...BASE_FORM, email: 'ana@' })
    expect(r.success).toBe(false)
  })

  it('deja vacíos los opcionales sin romper', () => {
    const r = appraisalFormSchema.safeParse({
      ...BASE_FORM,
      neighborhood: '',
      areaM2: '',
      rooms: '',
      comments: '',
    })

    expect(r.success).toBe(true)
  })

  it('convierte los números que llegan como texto del formulario', () => {
    const r = appraisalFormSchema.parse({ ...BASE_FORM, areaM2: '120.5', rooms: '3' })

    expect(r.areaM2).toBe(120.5)
    expect(r.rooms).toBe(3)
  })
})
