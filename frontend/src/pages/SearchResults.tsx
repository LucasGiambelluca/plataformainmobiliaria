import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { SlidersHorizontal } from 'lucide-react'
import PropertyCard from '../components/properties/PropertyCard'
import Select from '../components/common/Select'
import Pagination from '../components/common/Pagination'
import { EmptyState, ErrorState } from '../components/common/AsyncState'
import { PropertyGridSkeleton } from '../components/common/Skeleton'
import { useResource } from '../hooks/useResource'
import { useDebounced } from '../hooks/useDebounced'
import { useSeo } from '../hooks/useSeo'
import { getCatalog } from '../api/publicCatalog'
import type { OperationType, PropertyType } from '../api/schemas'
import { operationLabels, typeLabels, typeOptions } from '../lib/propertyLabels'

const operaciones: OperationType[] = ['sale', 'rent', 'temporary_rental']

const PAGE_SIZE = 24

const sortOptions = [
  { value: 'relevance', label: 'Más relevantes' },
  { value: 'price_asc', label: 'Menor precio' },
  { value: 'price_desc', label: 'Mayor precio' },
  { value: 'recent', label: 'Más recientes' },
]

export default function SearchResults() {
  const [params, setParams] = useSearchParams()
  const [sort, setSort] = useState('relevance')

  const op = (params.get('op') ?? '') as OperationType | ''
  const type = (params.get('type') ?? '') as PropertyType | ''
  const q = params.get('q') ?? ''
  // Llega desde el desplegable de Inmobiliarias del header.
  const agency = params.get('agency') ?? ''
  // La página va en la URL y no en el estado: así el botón atrás vuelve a la
  // página donde estabas y un enlace compartido abre la misma.
  const page = Math.max(1, Number(params.get('page')) || 1)

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    // Cambiar un filtro cambia el resultado: seguir en la página 4 de algo
    // que ahora tiene 1 dejaría la grilla vacía.
    next.delete('page')
    setParams(next)
  }

  const irAPagina = (n: number) => {
    const next = new URLSearchParams(params)
    if (n > 1) next.set('page', String(n))
    else next.delete('page')
    setParams(next)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // El filtro de ubicación se escribe letra por letra: no conviene pedir en cada tecla.
  const qDebounced = useDebounced(q)

  const hayFiltros = Boolean(op || type || q || agency)

  useSeo({
    title: [
      type ? typeLabels[type as PropertyType] + 's' : 'Propiedades',
      op ? `en ${operationLabels[op].toLowerCase()}` : '',
      q ? `en ${q}` : '',
    ]
      .filter(Boolean)
      .join(' '),
    description:
      'Buscá entre las propiedades publicadas por las inmobiliarias de la plataforma.',
    canonicalPath: '/buscar',
    // Una búsqueda filtrada es contenido delgado y hay combinaciones infinitas:
    // se le pide al buscador que no la indexe pero sí siga los enlaces, que son
    // las fichas, que sí queremos indexadas. El /buscar pelado sí se indexa.
    noIndex: hayFiltros,
  })

  const catalogo = useResource(
    () =>
      getCatalog({
        search: qDebounced || undefined,
        operationType: op || undefined,
        propertyType: type || undefined,
        agency: agency || undefined,
        sort: sort as 'relevance',
        page,
        pageSize: PAGE_SIZE,
      }),
    [qDebounced, op, type, agency, sort, page],
  )

  const total = catalogo.data?.total ?? 0

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="grid gap-8 md:grid-cols-[300px_1fr]">
        {/* Filtros */}
        <aside className="h-fit rounded-lg border border-line bg-surface p-5 shadow-card">
          <h2 className="flex items-center gap-2 text-lg font-semibold tracking-base text-ink">
            <SlidersHorizontal className="h-4 w-4 text-brand" />
            Filtros
          </h2>

          <div className="mt-5 space-y-5">
            {agency && (
              <button
                onClick={() => setParam('agency', '')}
                className="w-full rounded-md border border-brand px-3 py-2 text-xs font-medium text-brand transition-colors hover:bg-brand hover:text-white"
              >
                Quitar filtro de inmobiliaria
              </button>
            )}

            <div>
              <span className="mb-1.5 block text-sm font-medium text-ink">Operación</span>
              <div className="flex flex-wrap gap-2">
                {operaciones.map((o) => (
                  <button
                    key={o}
                    onClick={() => setParam('op', op === o ? '' : o)}
                    className={`rounded-pill border px-3 py-1.5 text-xs font-medium transition-colors ${
                      op === o
                        ? 'border-brand bg-brand text-white'
                        : 'border-line bg-surface text-ink hover:border-brand'
                    }`}
                  >
                    {operationLabels[o]}
                  </button>
                ))}
              </div>
            </div>

            <Select
              label="Tipo de propiedad"
              placeholder="Todas"
              options={typeOptions}
              value={type}
              onChange={(e) => setParam('type', e.target.value)}
            />

            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-ink">Ubicación</span>
              <input
                value={q}
                onChange={(e) => setParam('q', e.target.value)}
                placeholder="Localidad o zona"
                className="w-full rounded-md border border-line bg-surface px-4 py-2.5 text-sm text-ink placeholder:text-muted focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
              />
            </label>
          </div>
        </aside>

        {/* Resultados */}
        <section>
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-xl font-semibold tracking-base text-ink">
              {catalogo.loading && !catalogo.data
                ? 'Buscando…'
                : `${total} ${total === 1 ? 'propiedad' : 'propiedades'}`}
              {op && ` en ${operationLabels[op].toLowerCase()}`}
              {agency && catalogo.data?.items[0]
                ? ` de ${catalogo.data.items[0].agency.name}`
                : ''}
            </h1>
            <div className="w-52">
              <Select
                options={sortOptions}
                value={sort}
                onChange={(e) => {
                  setSort(e.target.value)
                  // Otro orden es otro resultado: se vuelve a la primera página.
                  irAPagina(1)
                }}
              />
            </div>
          </div>

          {catalogo.error ? (
            <ErrorState error={catalogo.error} onRetry={catalogo.reload} />
          ) : catalogo.loading && !catalogo.data ? (
            <PropertyGridSkeleton
              count={6}
              className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3"
            />
          ) : catalogo.data && catalogo.data.items.length === 0 ? (
            <EmptyState>No hay resultados con esos filtros.</EmptyState>
          ) : (
            <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
              {catalogo.data?.items.map((p) => (
                <PropertyCard key={p.id} property={p} />
              ))}
            </div>
          )}

          <Pagination
            page={page}
            pageSize={PAGE_SIZE}
            total={total}
            loading={catalogo.loading}
            onChange={irAPagina}
          />
        </section>
      </div>
    </div>
  )
}
