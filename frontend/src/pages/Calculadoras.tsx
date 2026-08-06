import { useState } from 'react'
import { Calculator, Info } from 'lucide-react'
import { calcularCronograma, getIndices } from '../api/calculators'
import {
  cronogramaFormSchema,
  type CronogramaResult,
  type EstadoSerie,
  type Indices,
  type Serie,
} from '../api/schemas'
import Botonera from '../components/calculadora/Botonera'
import ResultadoCronograma from '../components/calculadora/ResultadoCronograma'
import SelectorFecha from '../components/calculadora/SelectorFecha'
import Button from '../components/common/Button'
import Input from '../components/common/Input'
import { ErrorState } from '../components/common/AsyncState'
import { CalculadoraSkeleton } from '../components/common/Skeleton'
import { useResource } from '../hooks/useResource'
import { useSeo } from '../hooks/useSeo'
import { ApiError } from '../lib/apiError'

/**
 * Calculadora de actualización de alquileres (portal).
 *
 * Pide cada cuánto se actualiza el contrato, no hasta cuándo calcular, y
 * devuelve el cronograma completo de ajustes: es lo que un corredor necesita
 * para explicar cómo llegó al número, en vez de un monto suelto.
 *
 * Los índices los publican el BCRA y el INDEC; el backend los cachea y expone
 * el rango de cada serie, que es lo que acota el selector de fecha. Sin ese
 * rango no se puede dibujar el formulario: por eso la carga inicial va con
 * esqueleto y el error deja reintentar.
 *
 * El formulario no usa react-hook-form como el resto del panel: de sus cuatro
 * controles, tres son botoneras y un selector compuesto, ninguno un input
 * nativo que se pueda registrar. useState más un `safeParse` al enviar dice lo
 * mismo con menos ceremonia.
 */

const PERIODOS = Array.from({ length: 12 }, (_, i) => ({
  value: String(i + 1),
  label: String(i + 1),
}))

/** Primer día del mes de una fecha ISO. */
function primeroDelMes(iso: string): string {
  return `${iso.slice(0, 7)}-01`
}

/** Día 1 del mes siguiente al de una fecha ISO. */
function mesSiguiente(iso: string): string {
  const [anio, mes] = iso.split('-').map(Number)
  return mes === 12
    ? `${anio + 1}-01-01`
    : `${anio}-${String(mes + 1).padStart(2, '0')}-01`
}

/**
 * Primera fecha en la que un contrato puede arrancar con esta serie.
 *
 * En las mensuales no es el primer dato sino el mes siguiente: cada tramo se
 * calcula contra el índice del mes anterior, así que arrancar en el primer mes
 * de la serie no tiene base contra la cual comparar y el backend responde 422.
 * Ofrecerlo era garantizar ese 422.
 */
function inicioMinimo(estado: EstadoSerie): string {
  return estado.frecuencia === 'mensual'
    ? mesSiguiente(estado.desde)
    : estado.desde
}

export default function Calculadoras() {
  const indices = useResource<Indices>(getIndices, [])

  useSeo({
    title: 'Calculadora de actualización de alquileres',
    description:
      'Calculá el cronograma de ajustes de un contrato de alquiler con los índices oficiales: ICL, IPC, CER, UVA, IS e IPIM.',
  })

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <header className="text-center">
        <h1 className="font-serif text-3xl text-brand md:text-4xl">Calculadora</h1>
        <p className="mt-3 text-muted">
          Actualizá el valor de un contrato de alquiler con los índices oficiales.
        </p>
      </header>

      <div className="mt-10">
        {indices.loading && <CalculadoraSkeleton />}
        {indices.error && <ErrorState error={indices.error} onRetry={indices.reload} />}
        {indices.data && <Formulario indices={indices.data} />}
      </div>
    </div>
  )
}

/**
 * Serie con la que arranca la pantalla.
 *
 * El ICL es el índice de la Ley 27.551 y el que busca la mayoría, pero puede no
 * estar si el BCRA se cayó y no había nada cacheado: en ese caso se arranca con
 * cualquiera de las que sí llegaron, en vez de dejar la pantalla sin nada
 * seleccionado.
 */
function seriePorDefecto(indices: Indices): Serie {
  return 'icl' in indices ? 'icl' : Object.keys(indices)[0]
}

function Formulario({ indices }: { indices: Indices }) {
  const [serie, setSerie] = useState<Serie>(() => seriePorDefecto(indices))
  const [monto, setMonto] = useState('')
  const [mesesPeriodo, setMesesPeriodo] = useState(12)
  const [fechaInicio, setFechaInicio] = useState(() =>
    primeroDelMes(indices[seriePorDefecto(indices)].hasta),
  )

  const [errores, setErrores] = useState<Partial<Record<string, string>>>({})
  const [failure, setFailure] = useState<string | null>(null)
  const [calculando, setCalculando] = useState(false)
  const [resultado, setResultado] = useState<CronogramaResult | null>(null)
  const [entrada, setEntrada] = useState<{
    montoInicial: number
    fechaInicio: string
    mesesPeriodo: number
  } | null>(null)

  const estado = indices[serie]

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFailure(null)
    setErrores({})

    const parsed = cronogramaFormSchema.safeParse({
      montoInicial: monto,
      fechaInicio,
      mesesPeriodo,
      serie,
    })

    if (!parsed.success) {
      const flat = parsed.error.flatten().fieldErrors
      setErrores({
        montoInicial: flat.montoInicial?.[0],
        fechaInicio: flat.fechaInicio?.[0],
      })
      return
    }

    setCalculando(true)
    try {
      setResultado(await calcularCronograma(parsed.data))
      setEntrada({
        montoInicial: parsed.data.montoInicial,
        fechaInicio: parsed.data.fechaInicio,
        mesesPeriodo: parsed.data.mesesPeriodo,
      })
    } catch (err) {
      setFailure(err instanceof ApiError ? err.message : 'No se pudo calcular la actualización')
    } finally {
      setCalculando(false)
    }
  }

  /**
   * Al cambiar de índice se acomoda la fecha al rango de la serie nueva.
   *
   * Sin esto, pasar del ICL (desde 2020) al IPIM (desde 2015) dejaría elegida
   * una fecha que la serie nueva no cubre y el primer cálculo sería un 422.
   *
   * El piso es `inicioMinimo`, no `desde`: en una serie mensual el primer mes
   * publicado es justamente el que el backend rechaza, así que acomodar a
   * `desde` cambiaba un 422 por otro.
   */
  function cambiarSerie(nueva: Serie) {
    setSerie(nueva)
    setResultado(null)

    const estadoNuevo = indices[nueva]
    const minimo = inicioMinimo(estadoNuevo)

    if (fechaInicio < minimo) setFechaInicio(minimo)
    else if (fechaInicio > estadoNuevo.hasta) setFechaInicio(primeroDelMes(estadoNuevo.hasta))
  }

  if (resultado && entrada) {
    return (
      <section className="rounded-xl border border-line bg-surface p-6 shadow-card">
        <ResultadoCronograma resultado={resultado} serie={estado} entrada={entrada} />

        <Button
          type="button"
          variant="secondary"
          className="mt-6 w-full"
          onClick={() => setResultado(null)}
        >
          Volver
        </Button>

        <NotaLegal estado={estado} />
      </section>
    )
  }

  return (
    <section className="rounded-xl border border-line bg-surface p-6 shadow-card">
      <form onSubmit={onSubmit} className="space-y-5" noValidate>
        {failure && (
          <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {failure}
          </p>
        )}

        <Input
          label="Valor inicial del alquiler"
          inputMode="decimal"
          placeholder="Ej: 300000"
          value={monto}
          onChange={(e) => setMonto(e.target.value)}
          error={errores.montoInicial}
        />

        <SelectorFecha
          label="Fecha de inicio de contrato"
          value={fechaInicio}
          onChange={setFechaInicio}
          min={inicioMinimo(estado)}
          max={estado.hasta}
          error={errores.fechaInicio}
        />

        <Botonera
          label="Cada cuánto se actualiza (meses)"
          options={PERIODOS}
          value={String(mesesPeriodo)}
          onChange={(v) => setMesesPeriodo(Number(v))}
        />

        <div>
          <Botonera
            label="Índice de actualización"
            options={Object.entries(indices).map(([s, e]) => ({
              value: s,
              label: e.etiqueta,
            }))}
            value={serie}
            onChange={cambiarSerie}
          />
          <p className="mt-1.5 text-xs text-muted">{estado.nombre}</p>
        </div>

        <Button type="submit" disabled={calculando} className="w-full">
          <Calculator className="h-4 w-4" aria-hidden />
          {calculando ? 'Calculando…' : 'Calcular'}
        </Button>
      </form>

      <NotaLegal estado={estado} />
    </section>
  )
}

/**
 * Aviso de origen del dato.
 *
 * Muestra cuándo se sincronizó la serie a propósito: si el organismo está caído
 * la calculadora sigue respondiendo con lo último que bajó, y quien la usa tiene
 * derecho a saber de cuándo es ese número antes de firmar algo.
 */
function NotaLegal({ estado }: { estado: EstadoSerie }) {
  return (
    <div className="mt-6 flex gap-3 border-t border-line pt-5 text-xs text-muted">
      <Info className="h-4 w-4 shrink-0 text-accent" aria-hidden />
      <div className="space-y-1">
        <p>
          {estado.frecuencia === 'diaria'
            ? `El ${estado.organismo} no publica el ${estado.etiqueta} los sábados, domingos ni feriados: si la fecha de un ajuste cae en uno de esos días, se usa el último día hábil publicado.`
            : `El ${estado.organismo} publica el ${estado.etiqueta} de cada mes alrededor de dos semanas después de cerrado, así que el mes en curso todavía no está disponible.`}
        </p>
        <p>
          Herramienta orientativa: verificá el monto final contra la publicación oficial del{' '}
          {estado.organismo}.
          {estado.sincronizadoEn &&
            ` Índices actualizados el ${new Date(estado.sincronizadoEn).toLocaleString('es-AR')}.`}
        </p>
      </div>
    </div>
  )
}
