import { beforeEach, describe, expect, it, vi } from 'vitest'
import { uploadMedia } from '../../src/api/media'
import { ApiError } from '../../src/lib/apiError'
import { setAccessToken, setSessionExpiredHandler } from '../../src/lib/session'
import { useMockServer, type MockServer } from '../helpers/mockServer'

const PROPERTY_ID = 'prop-1'
const MEDIA_ID = 'media-1'
const UPLOAD_URL = 'https://storage.local/upload/tenants/t1/properties/prop-1/media-1.png?firma=x'
const PUBLIC_URL = 'https://storage.local/tenants/t1/properties/prop-1/media-1.png'

const SIGN_PATH = `/properties/${PROPERTY_ID}/media/upload-url`
const CONFIRM_PATH = `/properties/${PROPERTY_ID}/media/${MEDIA_ID}/confirm`
const MEDIA_PATH = `/properties/${PROPERTY_ID}/media/${MEDIA_ID}`

const mediaRow = (overrides: Record<string, unknown> = {}) => ({
  id: MEDIA_ID,
  type: 'image',
  url: PUBLIC_URL,
  thumbnailUrl: null,
  durationSec: null,
  sizeBytes: 1024,
  sortOrder: 0,
  isCover: true,
  status: 'processing',
  ...overrides,
})

const signedResponse = {
  media: mediaRow(),
  upload: {
    uploadUrl: UPLOAD_URL,
    contentType: 'image/png',
    expiresAt: '2026-07-27T12:00:00.000Z',
  },
}

function makeFile(): File {
  return new File([new Uint8Array(1024)], 'foto.png', { type: 'image/png' })
}

let server: MockServer

beforeEach(() => {
  server = useMockServer()
  setAccessToken('token-vigente')
  setSessionExpiredHandler(null)
})

describe('uploadMedia', () => {
  it('firma, sube al storage y confirma, en ese orden', async () => {
    server
      .on('post', SIGN_PATH, { status: 201, data: signedResponse })
      .on('put', UPLOAD_URL, { status: 200 })
      .on('post', CONFIRM_PATH, {
        status: 200,
        data: { media: mediaRow({ status: 'ready', sizeBytes: 1024 }) },
      })

    const result = await uploadMedia(PROPERTY_ID, makeFile())

    expect(result.status).toBe('ready')
    expect(server.calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      `post ${SIGN_PATH}`,
      `put ${UPLOAD_URL}`,
      `post ${CONFIRM_PATH}`,
    ])
  })

  it('declara el tipo y el tamaño reales del archivo al firmar', async () => {
    server
      .on('post', SIGN_PATH, { status: 201, data: signedResponse })
      .on('put', UPLOAD_URL, { status: 200 })
      .on('post', CONFIRM_PATH, { status: 200, data: { media: mediaRow({ status: 'ready' }) } })

    await uploadMedia(PROPERTY_ID, makeFile())

    expect(server.callsTo('post', SIGN_PATH)[0].body).toEqual({
      contentType: 'image/png',
      sizeBytes: 1024,
    })
  })

  it('el PUT al storage no lleva el token de nuestra API', async () => {
    // Mandar Authorization a S3 rompe la firma y además filtraría el token a
    // un tercero. El archivo va al storage, no al backend.
    server
      .on('post', SIGN_PATH, { status: 201, data: signedResponse })
      .on('put', UPLOAD_URL, { status: 200 })
      .on('post', CONFIRM_PATH, { status: 200, data: { media: mediaRow({ status: 'ready' }) } })

    await uploadMedia(PROPERTY_ID, makeFile())

    expect(server.callsTo('post', SIGN_PATH)[0].authorization).toBe('Bearer token-vigente')
    expect(server.callsTo('put', UPLOAD_URL)[0].authorization).toBeUndefined()
  })

  it('si el storage rechaza la subida, borra la fila que había quedado reservada', async () => {
    // Sin esto la fila queda en `processing` ocupando cupo del plan para siempre.
    server
      .on('post', SIGN_PATH, { status: 201, data: signedResponse })
      .on('put', UPLOAD_URL, { status: 403 })
      .on('delete', MEDIA_PATH, { status: 204 })

    await expect(uploadMedia(PROPERTY_ID, makeFile())).rejects.toBeInstanceOf(ApiError)

    expect(server.countOf('delete', MEDIA_PATH)).toBe(1)
    expect(server.countOf('post', CONFIRM_PATH)).toBe(0)
  })

  it('propaga el error del backend cuando no hay cupo en el plan', async () => {
    server.on('post', SIGN_PATH, {
      status: 402,
      data: {
        error: {
          code: 'LIMIT_EXCEEDED',
          message: 'Se alcanzó el límite del plan para: almacenamiento',
        },
      },
    })

    const err = (await uploadMedia(PROPERTY_ID, makeFile()).catch((e: unknown) => e)) as ApiError

    expect(err.code).toBe('LIMIT_EXCEEDED')
    expect(server.countOf('put', UPLOAD_URL)).toBe(0)
  })

  it('avisa el progreso completo al terminar', async () => {
    server
      .on('post', SIGN_PATH, { status: 201, data: signedResponse })
      .on('put', UPLOAD_URL, { status: 200 })
      .on('post', CONFIRM_PATH, { status: 200, data: { media: mediaRow({ status: 'ready' }) } })

    const onProgress = vi.fn()
    await uploadMedia(PROPERTY_ID, makeFile(), onProgress)

    expect(onProgress).toHaveBeenLastCalledWith(100)
  })

  it('una respuesta que no cumple el contrato falla como CONTRACT_MISMATCH', async () => {
    server.on('post', SIGN_PATH, { status: 201, data: { media: { id: MEDIA_ID } } })

    const err = (await uploadMedia(PROPERTY_ID, makeFile()).catch((e: unknown) => e)) as ApiError

    expect(err.code).toBe('CONTRACT_MISMATCH')
  })
})
