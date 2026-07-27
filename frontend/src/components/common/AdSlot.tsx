import { ads } from '../../data/mock'

interface Props {
  /** Índice del aviso mock a mostrar; sin índice cae al placeholder gris. */
  adIndex?: number
  /** Medida nominal del espacio, se muestra en el placeholder. */
  size?: string
  className?: string
}

// Espacio publicitario vendible según ui.pdf (bloques 1280×150).
// Con adIndex muestra un aviso mock; cuando exista el módulo de publicidad,
// acá se renderiza el banner real que venga del backend.
export default function AdSlot({
  adIndex,
  size = '1280×150',
  className = '',
}: Props) {
  const ad = adIndex !== undefined ? ads[adIndex % ads.length] : undefined

  if (!ad) {
    return (
      <div
        className={`flex h-[150px] items-center justify-center bg-ad ${className}`}
      >
        <span className="text-2xl text-ink/80">
          Espacio publicitario {size}
        </span>
      </div>
    )
  }

  return (
    <a
      href="#"
      className={`relative flex h-[150px] flex-col justify-center overflow-hidden rounded-md px-8 text-white transition-opacity hover:opacity-90 ${ad.bg} ${className}`}
    >
      <span className="absolute right-3 top-2 text-[10px] uppercase tracking-[0.2em] text-white/60">
        Publicidad
      </span>
      <span className="text-xs uppercase tracking-[0.25em] text-white/70">
        {ad.advertiser}
      </span>
      <span className="mt-1 font-serif text-2xl font-semibold md:text-3xl">
        {ad.headline}
      </span>
      <div className="mt-1 flex flex-wrap items-center gap-4">
        <span className="text-sm text-white/85">{ad.tagline}</span>
        <span className="rounded border border-white/70 px-4 py-1 text-sm font-medium">
          {ad.cta}
        </span>
      </div>
    </a>
  )
}
