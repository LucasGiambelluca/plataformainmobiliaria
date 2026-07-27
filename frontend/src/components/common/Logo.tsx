import { Link } from 'react-router-dom'

interface Props {
  /** Bajada opcional debajo del logo. */
  subtitle?: string
  /** Sobre fondo oscuro se usa la versión blanca. */
  variant?: 'navy' | 'white'
  /** Alto del logo; el ancho acompaña. */
  size?: 'sm' | 'md'
  className?: string
}

/**
 * Logo del portal. Es la imagen que entregó la diseñadora, no texto: el
 * cliente pidió que el logo quede idéntico en todas las secciones, y
 * reconstruirlo con fuentes del sistema nunca da el mismo trazo.
 */
export default function Logo({
  subtitle,
  variant = 'navy',
  size = 'md',
  className = '',
}: Props) {
  return (
    <Link to="/" className={`inline-flex flex-col gap-1 ${className}`}>
      <img
        src={variant === 'white' ? '/brand/logo-blanco.png' : '/brand/logo-navy.png'}
        alt="ER Entreriosprop"
        className={`w-auto ${size === 'sm' ? 'h-8' : 'h-12'}`}
      />
      {subtitle && (
        <span
          className={`font-serif text-xs ${
            variant === 'white' ? 'text-white/70' : 'text-brand/70'
          }`}
        >
          {subtitle}
        </span>
      )}
    </Link>
  )
}
