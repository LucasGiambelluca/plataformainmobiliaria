import { Link } from 'react-router-dom'

interface Props {
  /** Texto secundario debajo del nombre. */
  subtitle?: string
  className?: string
}

// Logo del portal según ui.pdf: monograma serif "ER" + wordmark navy.
export default function Logo({
  subtitle = 'El Portal Inmobiliario de Entre Rios',
  className = '',
}: Props) {
  return (
    <Link to="/" className={`flex items-center gap-3 ${className}`}>
      <span
        aria-hidden
        className="font-serif text-5xl font-medium leading-none text-brand"
      >
        <span className="-mr-2">E</span>R
      </span>
      <span className="leading-tight">
        <span className="block font-serif text-xl font-semibold text-brand">
          Entre Rios Propiedades
        </span>
        <span className="block font-serif text-xs text-brand">{subtitle}</span>
      </span>
    </Link>
  )
}
