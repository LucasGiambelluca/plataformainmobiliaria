import { useState } from 'react'
import Select from '../common/Select'

interface Props {
  label: string
  /** Fecha ISO (AAAA-MM-DD). */
  value: string
  onChange: (iso: string) => void
  /** Primer año elegible, tomado del rango de la serie. */
  anioDesde: number
  /** Último año elegible. */
  anioHasta: number
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

const opcionesMes = MESES.map((label, i) => ({ value: String(i + 1), label }))

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/** Último día del mes: no todos tienen 31, y febrero cambia con el bisiesto. */
function diasDelMes(anio: number, mes: number): number {
  return new Date(Date.UTC(anio, mes, 0)).getUTCDate()
}

/**
 * Mes y año de inicio del contrato, con el día escondido detrás de un enlace.
 *
 * El día casi nunca importa: en las series mensuales no cambia nada, y la
 * mayoría de los contratos arranca el 1. Pedirlo de entrada agregaría un
 * selector que el 90 % de las veces se deja como está, así que aparece solo si
 * alguien lo pide — igual que en la calculadora del Colegio.
 */
export default function SelectorFecha({
  label,
  value,
  onChange,
  anioDesde,
  anioHasta,
  error,
}: Props) {
  const [anio, mes, dia] = value.split('-').map(Number)
  const [mostrarDia, setMostrarDia] = useState(dia !== 1)

  const anios: { value: string; label: string }[] = []
  for (let a = anioHasta; a >= anioDesde; a--) anios.push({ value: String(a), label: String(a) })

  const dias = Array.from({ length: diasDelMes(anio, mes) }, (_, i) => ({
    value: String(i + 1),
    label: String(i + 1),
  }))

  function emitir(nuevoAnio: number, nuevoMes: number, nuevoDia: number) {
    // Si el día no existe en el mes destino (31 de enero → febrero), se corre
    // al último del mes en vez de emitir una fecha que no existe.
    const tope = diasDelMes(nuevoAnio, nuevoMes)
    onChange(`${nuevoAnio}-${pad(nuevoMes)}-${pad(Math.min(nuevoDia, tope))}`)
  }

  return (
    <div>
      <span className="mb-1.5 block text-sm font-medium text-ink">{label}</span>

      <div className={`grid gap-3 ${mostrarDia ? 'grid-cols-3' : 'grid-cols-2'}`}>
        <Select
          aria-label="Mes de inicio"
          options={opcionesMes}
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
