interface Props {
  /** Medida nominal del espacio, se muestra como placeholder. */
  size?: string
  className?: string
}

// Espacio publicitario vendible según ui.pdf (bloques 1280×150).
// Cuando exista el módulo de publicidad, acá se renderiza el banner real.
export default function AdSlot({ size = '1280×150', className = '' }: Props) {
  return (
    <div
      className={`flex h-[150px] items-center justify-center bg-ad ${className}`}
    >
      <span className="text-2xl text-ink/80">Espacio publicitario {size}</span>
    </div>
  )
}
