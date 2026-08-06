import { beforeEach, describe, expect, it } from 'vitest'
import { calcularCronograma, getIndices } from '../../src/api/calculators'
import { cronogramaFormSchema } from '../../src/api/schemas'
import { etiquetaTramo, mesAnterior, nombreMes } from '../../src/lib/indexLabels'
import { ApiError } from '../../src/lib/apiError'
import { setAccessToken, setSessionExpiredHandler } from '../../src/lib/session'
import { useMockServer, type MockServer } from '../helpers/mockServer'

function serie(over: Record<string, unknown> = {}) {
  return {
    desde: '2020-07-01',
    hasta: '2026-08-05',
    sincronizadoEn: '2026-08-06T14:36:13.917Z',
    etiqueta: 'ICL',
    nombre: 'Índice para Contratos de Locación',
    organismo: 'BCRA',
    frecuencia: 'diaria',
    ...over,
  }
}

const INDICES = {
  icl: serie(),
  cer: serie({ etiqueta: 'CER', nombre: 'Coeficiente de Estabilización de Referencia' }),
  uva: serie({ etiqueta: 'UVA', nombre: 'Unidad de Valor Adquisitivo' }),
  ipc: serie({
    etiqueta: 'IPC',
    nombre: 'Índice de Precios al Consumidor',
    organismo: 'INDEC',
    frecuencia: 'mensual',
    desde: '2016-12-01',
    hasta: '2026-06-01',
  }),
  is: serie({
    etiqueta: 'IS',
    nombre: 'Índice de Salarios',
    organismo: 'INDEC',
    frecuencia: 'mensual',
    desde: '2016-10-01',
    hasta: '2026-04-01',
  }),
  ipim: serie({
    etiqueta: 'IPIM',
    nombre: 'Índice de Precios Internos al por Mayor',
    organismo: 'INDEC',
    frecuencia: 'mensual',
    desde: '2015-12-01',
    hasta: '2026-05-01',
  }),
}

const CRONOGRAMA = {
  serie: 'icl',
  sincronizadoEn: '2026-08-06T14:36:13.917Z',
  tramos: [
    { numero: 1, fecha: '2024-08-01', indice: 17.1, aumento: 0, valor: 300000 },
    { numero: 2, fecha: '2025-02-01', indice: 22.31, aumento: 0.3047, valor: 391403.51 },
    { numero: 3, fecha: '2025-08-01', indice: 26.62, aumento: 0.1932, valor: 467017.54 },
  ],
}

let server: MockServer

beforeEach(() => {
  server = useMockServer()
  // La calculadora es pública: no debe exigir sesión.
  setAccessToken(null)
  setSessionExpiredHandler(null)
})

describe('getIndices', () => {
  it('trae las seis series con su rango y sus datos de catálogo', async () => {
    server.on('get', '/calculators/indices', { status: 200, data: INDICES })

    const indices = await getIndices()

    expect(Object.keys(indices).sort()).toEqual(['cer', 'icl', 'ipc', 'ipim', 'is', 'uva'])
    expect(indices.icl.etiqueta).toBe('ICL')
    expect(indices.ipc.frecuencia).toBe('mensual')
    expect(indices.ipim.hasta).toBe('2026-05-01')
  })

  it('no manda Authorization: es una herramienta abierta', async () => {
    server.on('get', '/calculators/indices', { status: 200, data: INDICES })

    await getIndices()

    expect(server.callsTo('get', '/calculators/indices')[0].authorization).toBeUndefined()
  })
})

describe('calcularCronograma', () => {
  it('manda el body completo y devuelve los tramos', async () => {
    server.on('post', '/calculators/cronograma', { status: 200, data: CRONOGRAMA })

    const r = await calcularCronograma({
      montoInicial: 300000,
      fechaInicio: '2024-08-01',
      mesesPeriodo: 6,
      serie: 'icl',
    })

    expect(r.tramos).toHaveLength(3)
    expect(r.tramos[2].valor).toBe(467017.54)
    expect(server.callsTo('post', '/calculators/cronograma')[0].body).toEqual({
      montoInicial: 300000,
      fechaInicio: '2024-08-01',
      mesesPeriodo: 6,
      serie: 'icl',
    })
  })

  it('normaliza el 422 del backend como ApiError con su mensaje', async () => {
    server.on('post', '/calculators/cronograma', {
      status: 422,
      data: {
        error: { code: 'VALIDATION_ERROR', message: 'El ICL rige desde el 2020-07-01' },
      },
    })

    const err = await calcularCronograma({
      montoInicial: 300000,
      fechaInicio: '2019-01-01',
      mesesPeriodo: 6,
      serie: 'icl',
    }).catch((e: unknown) => e)

    expect(err).toBeInstanceOf(ApiError)
    expect((err as ApiError).message).toMatch(/rige desde/)
  })
})

describe('cronogramaFormSchema', () => {
  it('convierte el monto de texto a número', () => {
    const parsed = cronogramaFormSchema.parse({
      montoInicial: '300000',
      fechaInicio: '2024-08-01',
      mesesPeriodo: 6,
      serie: 'icl',
    })

    expect(parsed.montoInicial).toBe(300000)
  })

  it('rechaza un monto que no es positivo', () => {
    for (const montoInicial of ['0', '-100', 'mil', '']) {
      const r = cronogramaFormSchema.safeParse({
        montoInicial,
        fechaInicio: '2024-08-01',
        mesesPeriodo: 6,
        serie: 'icl',
      })
      expect(r.success).toBe(false)
    }
  })

  it('rechaza un período fuera del 1..12 y un índice desconocido', () => {
    expect(
      cronogramaFormSchema.safeParse({
        montoInicial: '300000',
        fechaInicio: '2024-08-01',
        mesesPeriodo: 13,
        serie: 'icl',
      }).success,
    ).toBe(false)

    // CAC y CasaPropia quedaron afuera: no tienen API pública.
    expect(
      cronogramaFormSchema.safeParse({
        montoInicial: '300000',
        fechaInicio: '2024-08-01',
        mesesPeriodo: 6,
        serie: 'cac',
      }).success,
    ).toBe(false)
  })
})

describe('etiquetas del cronograma', () => {
  it('nombra los períodos usuales por su nombre', () => {
    expect(etiquetaTramo(1, 3)).toBe('Mes 3')
    expect(etiquetaTramo(2, 1)).toBe('Bim. 1')
    expect(etiquetaTramo(3, 4)).toBe('Trim. 4')
    expect(etiquetaTramo(4, 2)).toBe('Cuatrim. 2')
    expect(etiquetaTramo(6, 5)).toBe('Semes. 5')
    expect(etiquetaTramo(12, 2)).toBe('Año 2')
  })

  it('cae a un genérico en las periodicidades sin nombre propio', () => {
    // 5, 7, 8, 9, 10 y 11 meses no tienen nombre en castellano.
    expect(etiquetaTramo(7, 3)).toBe('Período 3')
  })

  it('da el mes de una fecha ISO y el anterior', () => {
    // La tarjeta HASTA muestra el mes previo al último ajuste.
    expect(nombreMes('2026-08-01')).toBe('Agosto')
    expect(mesAnterior('2026-08-01')).toBe('Julio')
    expect(mesAnterior('2026-01-20')).toBe('Diciembre')
  })
})
