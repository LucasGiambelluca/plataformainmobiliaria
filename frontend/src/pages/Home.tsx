import { useState } from 'react'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import HeroSearch from '../components/home/HeroSearch'
import AdSlot from '../components/common/AdSlot'
import PropertyCard from '../components/properties/PropertyCard'
import { EmptyState, ErrorState } from '../components/common/AsyncState'
import { PropertyGridSkeleton } from '../components/common/Skeleton'
import { useResource } from '../hooks/useResource'
import { useSeo } from '../hooks/useSeo'
import { getCatalog } from '../api/publicCatalog'
import type { OperationType } from '../api/schemas'
import { operationLabels } from '../lib/propertyLabels'

// Home del portal: hero con buscador (M2Prop.pdf), espacios publicitarios,
// carrusel de destacadas y grilla filtrable.

const searchTabs: { key: OperationType; label: string }[] = [
  { key: 'sale', label: 'Venta' },
  { key: 'rent', label: 'Alquiler' },
  { key: 'temporary_rental', label: 'Temporario' },
]

const CAROUSEL_SIZE = 3

// El cliente pidió que la sección de destacadas muestre siempre 6. Como ahora
// salen de la base, puede haber menos destacadas que eso: se completa con las
// últimas publicadas para no dejar la grilla coja.
const DESTACADAS_OBJETIVO = 6

export default function Home() {
  useSeo({
    title: 'El portal inmobiliario de Entre Ríos',
    description:
      'Casas, departamentos, terrenos y locales en venta y alquiler, publicados por las inmobiliarias de la región.',
    canonicalPath: '/',
  })

  const [page, setPage] = useState(0)
  const [filter, setFilter] = useState<OperationType | 'all'>('all')

  const destacadas = useResource(async () => {
    const featured = await getCatalog({
      onlyFeatured: true,
      pageSize: DESTACADAS_OBJETIVO,
    })
    if (featured.items.length >= DESTACADAS_OBJETIVO) return featured.items

    // Relleno: se piden algunas de más y se descartan las que ya vinieron
    // como destacadas, para no repetir tarjetas.
    const relleno = await getCatalog({
      sort: 'recent',
      pageSize: DESTACADAS_OBJETIVO * 2,
    })
    const yaEstan = new Set(featured.items.map((p) => p.id))
    return [
      ...featured.items,
      ...relleno.items.filter((p) => !yaEstan.has(p.id)),
    ].slice(0, DESTACADAS_OBJETIVO)
  }, [])

  const grilla = useResource(
    () =>
      getCatalog({
        operationType: filter === 'all' ? undefined : filter,
        pageSize: 12,
      }),
    [filter],
  )

  const items = destacadas.data ?? []
  const pages = Math.max(1, Math.ceil(items.length / CAROUSEL_SIZE))
  const carousel = items.slice(page * CAROUSEL_SIZE, page * CAROUSEL_SIZE + CAROUSEL_SIZE)

  return (
    <div>
      <HeroSearch />

      <div className="mx-auto max-w-7xl px-4 pt-8">
        <AdSlot adIndex={0} />
      </div>

      {/* Super destacadas */}
      <section className="mx-auto max-w-7xl px-4 pt-12">
        <h2 className="border-l-4 border-accent pl-3 font-serif text-2xl text-ink">
          Propiedades super destacadas
        </h2>

        {destacadas.error ? (
          <div className="mt-8">
            <ErrorState error={destacadas.error} onRetry={destacadas.reload} />
          </div>
        ) : destacadas.loading && !destacadas.data ? (
          <PropertyGridSkeleton
            count={CAROUSEL_SIZE}
            className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3"
          />
        ) : items.length === 0 ? (
          <div className="mt-6">
            <EmptyState>
              Todavía no hay propiedades destacadas. Las inmobiliarias pueden
              destacar sus publicaciones desde su panel.
            </EmptyState>
          </div>
        ) : (
          <div className="relative mt-8">
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {carousel.map((p) => (
                <PropertyCard key={p.id} property={p} />
              ))}
            </div>

            {pages > 1 && (
              <>
                <button
                  onClick={() => setPage((page - 1 + pages) % pages)}
                  aria-label="Anterior"
                  className="absolute -left-4 top-1/2 hidden h-9 w-9 -translate-y-1/2 place-items-center rounded-full border border-muted bg-surface text-ink shadow-card transition-colors hover:bg-canvas lg:grid"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setPage((page + 1) % pages)}
                  aria-label="Siguiente"
                  className="absolute -right-4 top-1/2 hidden h-9 w-9 -translate-y-1/2 place-items-center rounded-full border border-muted bg-surface text-ink shadow-card transition-colors hover:bg-canvas lg:grid"
                >
                  <ArrowRight className="h-4 w-4" />
                </button>
              </>
            )}
          </div>
        )}
      </section>

      {/* Grilla filtrable por operación */}
      <section className="mx-auto max-w-7xl px-4 pt-12">
        <h2 className="border-l-4 border-accent pl-3 font-serif text-2xl text-ink">
          Últimas publicaciones
        </h2>

        <div className="mt-6 flex flex-wrap items-center gap-x-2 gap-y-3">
          {[{ key: 'all' as const, label: 'Todas' }, ...searchTabs].map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`rounded-pill px-4 py-1.5 font-serif text-[15px] transition-colors ${
                filter === f.key
                  ? 'bg-accent-dark text-white'
                  : 'text-ink hover:text-accent-dark'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {grilla.error ? (
          <div className="mt-6">
            <ErrorState error={grilla.error} onRetry={grilla.reload} />
          </div>
        ) : grilla.loading && !grilla.data ? (
          <PropertyGridSkeleton
            count={12}
            compact
            className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6"
          />
        ) : (
          <>
            <p className="mt-6 font-serif text-sm font-semibold text-muted">
              {grilla.data?.total ?? 0}{' '}
              {grilla.data?.total === 1
                ? 'propiedad encontrada'
                : 'propiedades encontradas'}
            </p>

            {grilla.data && grilla.data.items.length === 0 ? (
              <div className="mt-4">
                <EmptyState>
                  {filter === 'all'
                    ? 'Todavía no hay propiedades publicadas en el portal.'
                    : `No hay propiedades en ${operationLabels[filter].toLowerCase()}.`}
                </EmptyState>
              </div>
            ) : (
              <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
                {grilla.data?.items.map((p) => (
                  <PropertyCard key={p.id} property={p} compact />
                ))}
              </div>
            )}
          </>
        )}
      </section>

      <div className="mx-auto grid max-w-7xl gap-4 px-4 pt-12 md:grid-cols-2">
        <AdSlot adIndex={1} />
        <AdSlot adIndex={2} />
      </div>
    </div>
  )
}
