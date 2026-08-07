import { beforeEach, describe, expect, it } from 'vitest'
import { setAccessToken } from '../../src/lib/session'
import {
  activatePaymentMode,
  getPaymentSettings,
  savePaymentCredentials,
} from '../../src/api/paymentSettings'
import { useMockServer, type MockServer } from '../helpers/mockServer'

const ESTADO = {
  activeMode: 'sandbox',
  credentials: {
    sandbox: { configured: true, last4: 'c8f2' },
    production: { configured: false, last4: null },
  },
  webhookUrl: 'https://api.test/api/billing/webhook',
  updatedAt: '2026-08-06T12:00:00.000Z',
  updatedBy: 'admin@plataforma.com',
}

let server: MockServer

beforeEach(() => {
  server = useMockServer()
  setAccessToken('token-admin')
})

describe('getPaymentSettings', () => {
  it('parsea el estado', async () => {
    server.on('get', '/admin/payment-settings', { status: 200, data: ESTADO })

    const estado = await getPaymentSettings()

    expect(estado.activeMode).toBe('sandbox')
    expect(estado.credentials.production.configured).toBe(false)
    expect(estado.webhookUrl).toContain('/api/billing/webhook')
  })

  it('acepta el estado vacío de una plataforma sin configurar', async () => {
    server.on('get', '/admin/payment-settings', {
      status: 200,
      data: { ...ESTADO, updatedAt: null, updatedBy: null },
    })

    await expect(getPaymentSettings()).resolves.toBeDefined()
  })
})

describe('savePaymentCredentials', () => {
  it('manda los dos campos al modo indicado', async () => {
    server.on('put', '/admin/payment-settings/production', {
      status: 200,
      data: { verified: true, last4: 'c8f2' },
    })

    await savePaymentCredentials('production', {
      accessToken: 'APP_USR-1234567890',
      webhookSecret: 'un-secreto-largo',
    })

    const [call] = server.callsTo('put', '/admin/payment-settings/production')
    expect(call.body).toEqual({
      accessToken: 'APP_USR-1234567890',
      webhookSecret: 'un-secreto-largo',
    })
  })
})

describe('activatePaymentMode', () => {
  it('devuelve cuántas suscripciones quedan huérfanas', async () => {
    server.on('post', '/admin/payment-settings/activate', {
      status: 200,
      data: { activeMode: 'production', orphanedSubscriptions: 3 },
    })

    const res = await activatePaymentMode('production')

    expect(res.orphanedSubscriptions).toBe(3)
  })
})
