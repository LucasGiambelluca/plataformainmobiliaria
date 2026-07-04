import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { SlidersHorizontal } from 'lucide-react'
import PropertyCard from '../components/properties/PropertyCard'
import Select from '../components/common/Select'
import { operationLabels, properties, typeLabels } from '../data/mock'
import type { Operation, PropertyType } from '../types'

const typeOptions = Object.entries(typeLabels).map(([value, label]) => ({
  value,
  label,
}))

export default function SearchResults() {
  const [params, setParams] = useSearchParams()
  const op = (params.get('op') ?? '') as Operation | ''
  const type = (params.get('type') ?? '') as PropertyType | ''
  const q = params.get('q') ?? ''
  const [sort, setSort] = useState('relevance')

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next)
  }

  const results = useMemo(() => {
    let list = properties.slice()
    if (op) list = list.filter((p) => p.operation === op)
    if (type) list = list.filter((p) => p.type === type)
    if (q)
      list = list.filter((p) =>
        `${p.city} ${p.address}`.toLowerCase().includes(q.toLowerCase()),
      )
    if (sort === 'price-asc') list.sort((a, b) => a.price - b.price)
    if (sort === 'price-desc') list.sort((a, b) => b.price - a.price)
    return list
  }, [op, type, q, sort])

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="grid gap-8 md:grid-cols-[300px_1fr]">
        {/* Filters */}
        <aside className="h-fit rounded-lg border border-line bg-surface p-5 shadow-card">
          <h2 className="flex items-center gap-2 text-lg font-semibold tracking-base text-ink">
            <SlidersHorizontal className="h-4 w-4 text-brand" />
            Filtros
          </h2>

          <div className="mt-5 space-y-5">
            <div>
              <span className="mb-1.5 block text-sm font-medium text-ink">
                Operación
              </span>
              <div className="flex flex-wrap gap-2">
                {(['venta', 'alquiler', 'temporal'] as Operation[]).map((o) => (
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
              <span className="mb-1.5 block text-sm font-medium text-ink">
                Ubicación
              </span>
              <input
                value={q}
                onChange={(e) => setParam('q', e.target.value)}
                placeholder="Localidad o zona"
                className="w-full rounded-md border border-line bg-surface px-4 py-2.5 text-sm text-ink placeholder:text-muted focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
              />
            </label>
          </div>
        </aside>

        {/* Results */}
        <section>
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-xl font-semibold tracking-base text-ink">
              {results.length} propiedades
              {op && ` en ${operationLabels[op].toLowerCase()}`}
            </h1>
            <div className="w-52">
              <Select
                options={[
                  { value: 'relevance', label: 'Más relevantes' },
                  { value: 'price-asc', label: 'Menor precio' },
                  { value: 'price-desc', label: 'Mayor precio' },
                ]}
                value={sort}
                onChange={(e) => setSort(e.target.value)}
              />
            </div>
          </div>

          {results.length === 0 ? (
            <p className="rounded-lg border border-line bg-surface p-8 text-center text-muted">
              No hay resultados con esos filtros.
            </p>
          ) : (
            <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
              {results.map((p) => (
                <PropertyCard key={p.id} property={p} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
