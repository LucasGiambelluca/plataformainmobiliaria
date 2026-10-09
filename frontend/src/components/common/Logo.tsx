import { Link } from 'react-router-dom'
import { conBase } from '../../lib/basePath'

interface Props {
  /** Bajada opcional debajo del logo. */
  subtitle?: string
  /** Sobre fondo oscuro se usa la versión con el "Prop" en blanco. */
  variant?: 'dark' | 'white'
  /** Alto del logo; el ancho acompaña. */
  size?: 'sm' | 'md'
  className?: string
}

/**
 * Logo del portal (M2Prop). Es la imagen que entregó el cliente, no texto:
 * reconstruirlo con fuentes del sistema nunca da el mismo trazo.
 *
 * `md` mide 36,3px de alto, lo que mide el dibujo en el header de M2Prop.pdf
 * (la imagen del PDF es de 44px pero trae aire alrededor; esta viene recortada).
 */
export default function Logo({
  subtitle,
  variant = 'dark',
  size = 'md',
  className = '',
}: Props) {
  return (
    <Link to="/" className={`inline-flex shrink-0 flex-col gap-1 ${className}`}>
      <img
        src={conBase(variant === 'white' ? '/brand/m2prop-blanco.png' : '/brand/m2prop.png')}
        alt="M2Prop"
        className={`w-auto ${size === 'sm' ? 'h-8' : 'h-[36.3px]'}`}
      />
      {subtitle && (
        <span
          className={`font-serif text-xs ${
            variant === 'white' ? 'text-white/70' : 'text-ink/70'
          }`}
        >
          {subtitle}
        </span>
      )}
    </Link>
  )
}
