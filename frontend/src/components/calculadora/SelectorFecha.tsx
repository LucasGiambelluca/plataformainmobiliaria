import { useState } from 'react'
import Select from '../common/Select'

interface Props {
  label: string
  /** Fecha ISO (AAAA-MM-DD). */
  value: string
  onChange: (iso: string) => void
  /** Primera fecha elegible, en ISO. Sale del rango de la serie. */
  min: string
  /** Última fecha elegible, en ISO. */
  max: string
  error?: string
}

const MESES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
]

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/** Último día del mes: no todos tienen 31, y febrero cambia con el bisiesto. */
function diasDelMes(anio: number, mes: number): number {
  return new Date(Date.UTC(anio, mes, 0)).getUTCDate()
}

function partes(iso: string): [number, number, number] {
  const [a, m, d] = iso.split('-').map(Number)
  return [a, m, d]
}

function opciones(desde: number, hasta: number, etiqueta: (n: number) => string) {
  const items: { value: string; label: string }[] = []
  for (let n = desde; n <= hasta; n++) items.push({ value: String(n), label: etiqueta(n) })
  return items
}

/**
 * Mes y año de inicio del contrato, con el día escondido detrás de un enlace.
 *
 * El día casi nunca importa: en las series mensuales no cambia nada, y la
 * mayoría de los contratos arranca el 1. Pedirlo de entrada agregaría un
 * selector que el 90 % de las veces se deja como está, así que aparece solo si
 * alguien lo pide — igual que en la calculadora del Colegio.
 *
 * **Los tres selectores se acotan contra el rango real, no solo el año.** Antes
 * se limitaba únicamente el año: con el ICL, que arranca el 1/7/2020, el año
 * 2020 entraba entero y se podía elegir marzo de 2020 —o diciembre de 2026,
 * pasado el último dato publicado— y el cálculo volvía con un 422 sin que nada
 * en la pantalla hubiera avisado.
 */
export default function SelectorFecha({ label, value, onChange, min, max, error }: Props) {
  const [anio, mes, dia] = partes(value)
  const [anioMin, mesMin, diaMin] = partes(min)
  const [anioMax, mesMax, diaMax] = partes(max)

  const [mostrarDia, setMostrarDia] = useState(dia !== 1)

  // Los años van del más nuevo al más viejo: el contrato que se consulta suele
  // ser reciente.
  const anios = opciones(anioMin, anioMax, String).reverse()

  // En los años de borde el rango de meses se recorta al del propio dato.
  const primerMes = anio === anioMin ? mesMin : 1
  const ultimoMes = anio === anioMax ? mesMax : 12
  const meses = opciones(primerMes, ultimoMes, (n) => MESES[n - 1])

  const primerDia = anio === anioMin && mes === mesMin ? diaMin : 1
  const ultimoDia =
    anio === anioMax && mes === mesMax ? diaMax : diasDelMes(anio, mes)
  const dias = opciones(primerDia, ultimoDia, String)

  /**
   * Emite la fecha ya acotada al rango.
   *
   * Cambiar de año o de mes puede dejar el resto fuera de rango —de un año del
   * medio a un año de borde, o un 31 en un mes de 30—, así que cada parte se
   * recorta antes de emitir en vez de mandar una fecha que el backend va a
   * rechazar.
   */
  function emitir(nuevoAnio: number, nuevoMes: number, nuevoDia: number) {
    const mesTope = nuevoAnio === anioMax ? mesMax : 12
    const mesPiso = nuevoAnio === anioMin ? mesMin : 1
    const mesFinal = Math.min(Math.max(nuevoMes, mesPiso), mesTope)

    const diaTope =
      nuevoAnio === anioMax && mesFinal === mesMax
        ? diaMax
        : diasDelMes(nuevoAnio, mesFinal)
    const diaPiso = nuevoAnio === anioMin && mesFinal === mesMin ? diaMin : 1
    const diaFinal = Math.min(Math.max(nuevoDia, diaPiso), diaTope)

    onChange(`${nuevoAnio}-${pad(mesFinal)}-${pad(diaFinal)}`)
  }

  return (
    <div>
      <span className="mb-1.5 block text-sm font-medium text-ink">{label}</span>

      <div className={`grid gap-3 ${mostrarDia ? 'grid-cols-3' : 'grid-cols-2'}`}>
        <Select
          aria-label="Mes de inicio"
          options={meses}
          value={String(mes)}
          onChange={(e) => emitir(anio, Number(e.target.value), dia)}
        />
        <Select
          aria-label="Año de inicio"
          options={anios}
          value={String(anio)}
          onChange={(e) => emitir(Number(e.target.value), mes, dia)}
        />
        {mostrarDia && (
          <Select
            aria-label="Día de inicio"
            options={dias}
            value={String(dia)}
            onChange={(e) => emitir(anio, mes, Number(e.target.value))}
          />
        )}
      </div>

      {!mostrarDia && (
        <button
          type="button"
          onClick={() => setMostrarDia(true)}
          className="mt-1.5 text-xs text-brand hover:underline"
        >
          + Elegir día específico
        </button>
      )}

      {error && <span className="mt-1 block text-xs text-red-600">{error}</span>}
    </div>
  )
}
