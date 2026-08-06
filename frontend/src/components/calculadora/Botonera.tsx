interface Opcion {
  value: string
  label: string
}

interface Props {
  /** Rótulo del grupo. Se lee como `aria-label` del contenedor. */
  label: string
  options: Opcion[]
  value: string
  onChange: (value: string) => void
}

/**
 * Grupo de botones de opción única.
 *
 * Es un `radiogroup` y no un `select` a propósito: las doce periodicidades y
 * los seis índices se eligen de un vistazo, y desplegarlos escondería la opción
 * que la persona está buscando comparar.
 */
export default function Botonera({ label, options, value, onChange }: Props) {
  return (
    <div>
      <span className="mb-1.5 block text-sm font-medium text-ink">{label}</span>
      <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
        {options.map((o) => {
          const activa = o.value === value
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={activa}
              onClick={() => onChange(o.value)}
              className={`min-w-[3rem] rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                activa
                  ? 'bg-brand text-white'
                  : 'border border-line bg-surface text-ink hover:bg-canvas'
              }`}
            >
              {o.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
