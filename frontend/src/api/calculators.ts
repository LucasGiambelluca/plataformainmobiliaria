import { getJson, postJson } from '../lib/api'
import {
  cronogramaResultSchema,
  indicesResponseSchema,
  type CronogramaResult,
  type Indices,
  type Serie,
} from './schemas'

/**
 * Calculadora de actualización de alquileres del portal.
 *
 * Endpoints abiertos: no llevan sesión ni tenant. Las series las publican el
 * BCRA (ICL, CER, UVA) y el INDEC (IPC, IS, IPIM), y el backend las cachea.
 */

/**
 * Rango disponible y datos de cada serie. De acá sale la botonera de índices,
 * el nombre largo que se muestra abajo y el rango que acota el selector de
 * fecha: así el frontend no repite una lista que el backend ya tiene.
 */
export function getIndices(): Promise<Indices> {
  return getJson('/calculators/indices', indicesResponseSchema)
}

export interface CronogramaInput {
  montoInicial: number
  fechaInicio: string
  mesesPeriodo: number
  serie: Serie
}

export function calcularCronograma(input: CronogramaInput): Promise<CronogramaResult> {
  return postJson('/calculators/cronograma', cronogramaResultSchema, input)
}
