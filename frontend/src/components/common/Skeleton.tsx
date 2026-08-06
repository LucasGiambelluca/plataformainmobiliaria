/**
 * Esqueletos de carga (tarea 4.14).
 *
 * Reemplazan al spinner en las pantallas públicas: dibujan la forma del
 * contenido que viene, así el layout no salta cuando llega la respuesta y la
 * espera se percibe más corta. El spinner sigue siendo la opción correcta para
 * acciones puntuales (guardar, subir un archivo), donde no hay forma que anticipar.
 *
 * Todos llevan `aria-hidden`: quien usa lector de pantalla no necesita que le
 * describan cajas grises. El estado de carga se anuncia una sola vez desde el
 * contenedor.
 */

interface SkeletonProps {
  className?: string
}

/** Bloque gris con la animación de pulso. La forma la pone quien lo usa. */
export function Skeleton({ className = '' }: SkeletonProps) {
  return <div className={`animate-pulse rounded bg-canvas ${className}`} aria-hidden />
}

/** Silueta de PropertyCard: foto 4:3, tipo, título, ubicación, atributos y precio. */
export function PropertyCardSkeleton({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <div className="flex flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-card">
        <Skeleton className="m-2 aspect-square rounded-lg" />
        <div className="flex flex-col gap-2 px-3 pb-3">
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-card">
      <Skeleton className="m-2 aspect-[4/3] rounded-lg" />
      <div className="flex flex-1 flex-col p-4 pt-2">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="mt-2 h-5 w-11/12" />
        <Skeleton className="mt-2 h-4 w-2/3" />
        <div className="mt-3 flex gap-4">
          <Skeleton className="h-4 w-10" />
          <Skeleton className="h-4 w-10" />
          <Skeleton className="h-4 w-14" />
        </div>
        <div className="mt-4 flex items-center justify-between border-t border-line pt-3">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-3 w-20" />
        </div>
      </div>
    </div>
  )
}

interface GridProps {
  count?: number
  compact?: boolean
  className?: string
}

/**
 * Grilla de tarjetas en carga. `className` recibe las mismas columnas que la
 * grilla real: si difieren, el layout salta al llegar los datos, que es
 * justamente lo que el esqueleto viene a evitar.
 */
export function PropertyGridSkeleton({
  count = 6,
  compact = false,
  className = 'grid gap-4 sm:grid-cols-2 lg:grid-cols-3',
}: GridProps) {
  return (
    <div className={className} role="status" aria-label="Cargando propiedades">
      {Array.from({ length: count }, (_, i) => (
        <PropertyCardSkeleton key={i} compact={compact} />
      ))}
    </div>
  )
}

/** Silueta de la ficha: galería a la izquierda, formulario de contacto a la derecha. */
export function PropertyDetailSkeleton() {
  return (
    <div role="status" aria-label="Cargando propiedad">
      <Skeleton className="h-4 w-64" />

      <div className="mt-5 grid gap-8 lg:grid-cols-[1.6fr_1fr]">
        <div>
          <Skeleton className="aspect-[16/10] w-full rounded-lg" />
          <div className="mt-3 grid grid-cols-4 gap-3">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="aspect-[4/3] rounded-md" />
            ))}
          </div>

          <div className="mt-6 rounded-lg border border-line bg-surface p-6 shadow-card">
            <Skeleton className="h-6 w-40 rounded-pill" />
            <Skeleton className="mt-3 h-8 w-4/5" />
            <Skeleton className="mt-2 h-4 w-1/2" />
            <Skeleton className="mt-4 h-9 w-56" />
            <div className="mt-6 flex gap-6 border-t border-line pt-5">
              {Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} className="h-5 w-24" />
              ))}
            </div>
            <div className="mt-6 space-y-2 border-t border-line pt-5">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          </div>
        </div>

        <div className="h-fit rounded-lg border border-line bg-surface p-6 shadow-card">
          <Skeleton className="h-6 w-48" />
          <div className="mt-4 space-y-3">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-10 w-full rounded-md" />
            ))}
            <Skeleton className="h-24 w-full rounded-md" />
            <Skeleton className="h-10 w-full rounded-md" />
          </div>
        </div>
      </div>
    </div>
  )
}

/** Silueta del directorio: dos grupos de localidad con tres tarjetas cada uno. */
export function AgencyDirectorySkeleton() {
  return (
    <div role="status" aria-label="Cargando inmobiliarias">
      <div className="mt-8 flex flex-wrap gap-2">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-8 w-24 rounded-pill" />
        ))}
      </div>
      <Skeleton className="mt-4 h-11 w-full max-w-md rounded-md" />

      {Array.from({ length: 2 }, (_, grupo) => (
        <section key={grupo} className="mt-8">
          <Skeleton className="h-7 w-52" />
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }, (_, i) => (
              <div
                key={i}
                className="rounded-xl border border-line bg-surface p-5 shadow-card"
              >
                <div className="flex items-center gap-3">
                  <Skeleton className="h-11 w-11 shrink-0 rounded-full" />
                  <div className="min-w-0 flex-1">
                    <Skeleton className="h-5 w-3/4" />
                    <Skeleton className="mt-2 h-3 w-1/2" />
                  </div>
                </div>
                <Skeleton className="mt-4 h-4 w-full" />
                <Skeleton className="mt-2 h-4 w-2/3" />
                <Skeleton className="mt-4 h-8 w-36 rounded" />
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

/** Silueta del encabezado de una web de inmobiliaria: carrusel y barra de marca. */
export function AgencySiteSkeleton() {
  return (
    <div role="status" aria-label="Cargando el sitio de la inmobiliaria">
      <div className="flex items-center gap-4 border-b border-line px-4 py-4">
        <Skeleton className="h-12 w-12 rounded-full" />
        <Skeleton className="h-6 w-52" />
      </div>
      <Skeleton className="aspect-[21/9] w-full rounded-none" />
      <div className="mx-auto mt-8 max-w-7xl px-4">
        <Skeleton className="h-7 w-64" />
        <PropertyGridSkeleton count={6} className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3" />
      </div>
    </div>
  )
}

/** Silueta de la calculadora: solapas, campos del formulario y botón. */
export function CalculadoraSkeleton() {
  return (
    <div role="status" aria-label="Cargando la calculadora">
      <div className="rounded-xl border border-line bg-surface p-6 shadow-card">
        {/* Monto y fecha */}
        {Array.from({ length: 2 }, (_, i) => (
          <div key={i} className={i === 0 ? '' : 'mt-5'}>
            <Skeleton className="h-3 w-40" />
            <Skeleton className="mt-2 h-11 w-full rounded-md" />
          </div>
        ))}

        {/* Botonera de periodicidad */}
        <div className="mt-5">
          <Skeleton className="h-3 w-52" />
          <div className="mt-2 flex flex-wrap gap-2">
            {Array.from({ length: 12 }, (_, i) => (
              <Skeleton key={i} className="h-10 w-12 rounded-md" />
            ))}
          </div>
        </div>

        {/* Botonera de índices */}
        <div className="mt-5">
          <Skeleton className="h-3 w-44" />
          <div className="mt-2 flex flex-wrap gap-2">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-10 w-16 rounded-md" />
            ))}
          </div>
        </div>

        <Skeleton className="mt-6 h-11 w-full rounded" />
      </div>
    </div>
  )
}
