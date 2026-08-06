import type { CronogramaResult, EstadoSerie } from '../../api/schemas'
import { etiquetaTramo, mesAnterior, nombreMes } from '../../lib/indexLabels'
import { formatARS } from '../../lib/format'

interface Props {
  resultado: CronogramaResult
  serie: EstadoSerie
  /** Lo que se ingresó, para repetirlo bajo las tarjetas. */
  entrada: { montoInicial: number; fechaInicio: string; mesesPeriodo: number }
}

/**
 * Importe del cronograma, en pesos enteros.
 *
 * No usa `formatARS` directo: ese helper está pensado para importes que ya son
 * enteros (planes, facturación) y no fija decimales mínimos, así que un monto
 * con centavos salía disparejo — "$ 409.699,63" arriba de "$ 472.764,6". Un
 * alquiler además se pacta en pesos redondos: el peso de más o de menos no lo
 * escribe nadie en el contrato. Es también lo que muestra la calculadora del
 * Colegio. El backend sigue devolviendo los centavos; acá solo se redondea al
 * mostrar.
 */
function formatMonto(valor: number): string {
  return formatARS(Math.round(valor))
}

function formatPorcentaje(fraccion: number): string {
  return `${(fraccion * 100).toLocaleString('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} %`
}

function formatFecha(iso: string): string {
  const [anio, mes, dia] = iso.split('-')
  return `${dia}/${mes}/${anio}`
}

/**
 * Resultado del cronograma: el valor vigente arriba y el detalle de cada ajuste
 * abajo.
 *
 * Las tarjetas HASTA/DESDE salen de los dos últimos tramos, no de un campo
 * aparte de la respuesta: repetir el mismo dato en dos lugares del cuerpo abre
 * la puerta a que se contradigan.
 */
export default function ResultadoCronograma({ resultado, serie, entrada }: Props) {
  const { tramos } = resultado
  const ultimo = tramos[tramos.length - 1]
  const anteultimo = tramos.length > 1 ? tramos[tramos.length - 2] : null

  return (
    <div>
      <div className="grid gap-4 sm:grid-cols-2">
        {anteultimo && (
          <Tarjeta rotulo="Hasta" mes={mesAnterior(ultimo.fecha)} valor={anteultimo.valor} />
        )}
        <Tarjeta rotulo="Desde" mes={nombreMes(ultimo.fecha)} valor={ultimo.valor} destacada />
      </div>

      <p className="mt-4 text-center text-sm text-muted">
        Valores ingresados: {formatMonto(entrada.montoInicial)} ·{' '}
        {formatFecha(entrada.fechaInicio)} · cada {entrada.mesesPeriodo}{' '}
        {entrada.mesesPeriodo === 1 ? 'mes' : 'meses'} · {serie.etiqueta}
      </p>

      {/* La tabla scrollea sola en pantallas chicas en vez de desbordar la página. */}
      <div className="mt-5 overflow-x-auto">
        <table className="w-full min-w-[30rem] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
              <th scope="col" className="py-2 pr-3 font-medium">
                Período
              </th>
              <th scope="col" className="py-2 pr-3 font-medium">
                Fecha
              </th>
              <th scope="col" className="py-2 pr-3 text-right font-medium">
                {serie.etiqueta}
              </th>
              <th scope="col" className="py-2 pr-3 text-right font-medium">
                Aumento
              </th>
              <th scope="col" className="py-2 text-right font-medium">
                Valor
              </th>
            </tr>
          </thead>
          <tbody>
            {tramos.map((t) => (
              <tr key={t.numero} className="border-b border-line/60">
                <td className="py-2.5 pr-3 text-muted">
                  {etiquetaTramo(entrada.mesesPeriodo, t.numero)}
                </td>
                <td className="py-2.5 pr-3">{formatFecha(t.fecha)}</td>
                <td className="py-2.5 pr-3 text-right tabular-nums">
                  {t.indice.toLocaleString('es-AR', { maximumFractionDigits: 4 })}
                </td>
                <td className="py-2.5 pr-3 text-right tabular-nums">
                  {formatPorcentaje(t.aumento)}
                </td>
                <td className="py-2.5 text-right font-medium tabular-nums">
                  {formatMonto(t.valor)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Tarjeta({
  rotulo,
  mes,
  valor,
  destacada = false,
}: {
  rotulo: string
  mes: string
  valor: number
  destacada?: boolean
}) {
  return (
    <div
      className={`rounded-xl border p-5 text-center ${
        destacada ? 'border-accent bg-accent/5' : 'border-line bg-canvas'
      }`}
    >
      <p
        className={`inline-block rounded px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white ${
          destacada ? 'bg-accent' : 'bg-muted'
        }`}
      >
        {rotulo}
      </p>
      <p className="mt-2 text-sm text-muted">{mes}</p>
      <p className="mt-1 text-3xl font-bold text-brand">{formatMonto(valor)}</p>
    </div>
  )
}
