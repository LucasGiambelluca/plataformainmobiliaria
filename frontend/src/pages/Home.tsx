import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowRight, ChevronRight, SlidersHorizontal } from 'lucide-react'
import Select from '../components/common/Select'
import AdSlot from '../components/common/AdSlot'
import PropertyCard from '../components/properties/PropertyCard'
import {
  categoryLabels,
  developmentStatusLabels,
  featuredProperties,
  operationLabels,
  properties,
  typeLabels,
} from '../data/mock'
import type { DevelopmentStatus, Operation } from '../types'

// Home del portal según ui.pdf: hero con buscador, CTAs de garantía/seguro,
// espacios publicitarios, carrusel de super destacadas y grilla filtrable.

const searchTabs: { key: Operation; label: string }[] = [
  { key: 'venta', label: 'Venta' },
  { key: 'alquiler', label: 'Alquiler' },
  { key: 'temporal', label: 'Temporario' },
]

const typeOptions = Object.entries(typeLabels).map(([value, label]) => ({
  value,
  label,
}))

const localityOptions = [
  'Paraná',
  'Concordia',
  'Gualeguaychú',
  'Concepción del Uruguay',
  'Colón',
  'Villaguay',
].map((c) => ({ value: c, label: c }))

// Filtros de la sección "Propiedades destacadas": operaciones + categorías.
const featuredFilters = [
  ...searchTabs.map((t) => ({ key: t.key as string, label: t.label })),
  ...Object.entries(categoryLabels).map(([key, label]) => ({ key, label })),
]

const developmentFilters: { key: DevelopmentStatus | 'todo'; label: string }[] = [
  { key: 'todo', label: 'Todo' },
  ...(
    Object.entries(developmentStatusLabels) as [DevelopmentStatus, string][]
  ).map(([key, label]) => ({ key, label })),
]

const CAROUSEL_SIZE = 3

export default function Home() {
  const navigate = useNavigate()

  // Buscador del hero
  const [op, setOp] = useState<Operation>('venta')
  const [type, setType] = useState('')
  const [location, setLocation] = useState('Paraná')

  // Carrusel de super destacadas
  const [page, setPage] = useState(0)
  const pages = Math.max(1, Math.ceil(featuredProperties.length / CAROUSEL_SIZE))
  const carousel = featuredProperties.slice(
    page * CAROUSEL_SIZE,
    page * CAROUSEL_SIZE + CAROUSEL_SIZE,
  )

  // Filtros de destacadas
  const [filter, setFilter] = useState('emprendimiento')
  const [devStatus, setDevStatus] = useState<DevelopmentStatus | 'todo'>('todo')

  const filtered = useMemo(() => {
    let list = properties
    if (filter in operationLabels) {
      list = list.filter((p) => p.operation === filter && !p.category)
    } else {
      list = list.filter((p) => p.category === filter)
      if (filter === 'emprendimiento' && devStatus !== 'todo') {
        list = list.filter((p) => p.developmentStatus === devStatus)
      }
    }
    return list
  }, [filter, devStatus])

  const search = () => {
    const params = new URLSearchParams({ op })
    if (type) params.set('type', type)
    if (location) params.set('q', location)
    navigate(`/buscar?${params.toString()}`)
  }

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden bg-brand">
        <div className="absolute inset-0">
          <img
            src="https://images.unsplash.com/photo-1560518883-ce09059eeffa?auto=format&fit=crop&w=1600&q=70"
            alt=""
            className="h-full w-full object-cover opacity-40 grayscale"
          />
          <div className="absolute inset-0 bg-hero-overlay/60" />
        </div>

        <div className="relative mx-auto max-w-7xl px-4 pb-16 pt-10 md:pb-20">
          <h1 className="font-serif text-4xl text-white/90 md:text-6xl">
            Vivi donde siempre soñaste
          </h1>
          <p className="mt-1 font-serif text-xl text-white/75 md:text-2xl">
            Con el respaldo del sector inmobiliario
          </p>

          {/* Buscador */}
          <div className="mt-10 max-w-2xl">
            <div className="flex">
              {searchTabs.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setOp(t.key)}
                  className={`rounded-t-lg px-8 py-2.5 font-serif text-[15px] transition-colors ${
                    op === t.key
                      ? 'bg-surface text-ink'
                      : 'bg-accent text-ink hover:bg-accent-dark hover:text-white'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="rounded-b-xl rounded-tr-xl bg-surface p-6 shadow-card-hover">
              <div className="grid gap-4 sm:grid-cols-2">
                <Select
                  label="Tipo de propiedad"
                  placeholder="Todos los tipos"
                  options={typeOptions}
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                  className="!border-accent font-serif"
                />
                <Select
                  label="Localidad"
                  options={localityOptions}
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="!border-accent font-serif"
                />
              </div>

              <div className="mt-5 flex items-center justify-between">
                <button
                  onClick={() => navigate(`/buscar?op=${op}`)}
                  className="flex items-center gap-2 font-serif text-[15px] text-ink transition-colors hover:text-accent-dark"
                >
                  <SlidersHorizontal className="h-4 w-4" />
                  Más filtros
                </button>
                <button
                  onClick={search}
                  className="rounded bg-accent-deep px-8 py-2 font-serif text-[15px] text-white transition-colors hover:bg-accent-dark"
                >
                  Buscar
                </button>
              </div>
            </div>
          </div>

          {/* CTAs garantía / seguro */}
          <div className="mt-8 max-w-2xl space-y-4">
            <Link
              to="/garantias"
              className="flex items-center justify-between rounded-md border border-accent bg-brand/80 px-5 py-2.5 transition-colors hover:bg-brand"
            >
              <span className="font-serif text-[15px] font-semibold text-white">
                Necesita una garantía para alquilar?
              </span>
              <ChevronRight className="h-4 w-4 text-accent" />
            </Link>
            <Link
              to="/seguros"
              className="flex items-center justify-between rounded-md border border-accent bg-brand/80 px-5 py-2.5 transition-colors hover:bg-brand"
            >
              <span className="font-serif text-[15px] font-semibold text-white">
                Asegure lo que tanto le costo conseguir
              </span>
              <ChevronRight className="h-4 w-4 text-accent" />
            </Link>
          </div>
        </div>
      </section>

      {/* Espacio publicitario */}
      <div className="mx-auto max-w-7xl px-4 pt-8">
        <AdSlot />
      </div>

      {/* Propiedades super destacadas */}
      <section className="mx-auto max-w-7xl px-4 pt-12">
        <h2 className="border-l-4 border-accent pl-3 font-serif text-2xl text-ink">
          Propiedades super destacadas
        </h2>

        <div className="relative mt-8">
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {carousel.map((p) => (
              <PropertyCard key={p.id} property={p} />
            ))}
          </div>

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
        </div>
      </section>

      {/* Propiedades destacadas */}
      <section className="mx-auto max-w-7xl px-4 pt-12">
        <h2 className="border-l-4 border-accent pl-3 font-serif text-2xl text-ink">
          Propiedades destacadas
        </h2>

        <div className="mt-6 flex flex-wrap items-center gap-x-2 gap-y-3">
          {featuredFilters.map((f) => (
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

        {filter === 'emprendimiento' && (
          <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-3">
            {developmentFilters.map((f) => (
              <button
                key={f.key}
                onClick={() => setDevStatus(f.key)}
                className={`rounded-pill px-4 py-1.5 font-serif text-[15px] transition-colors ${
                  devStatus === f.key
                    ? 'bg-brand text-white'
                    : 'text-ink hover:text-accent-dark'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        )}

        <p className="mt-6 font-serif text-sm font-semibold text-muted">
          {filtered.length}{' '}
          {filtered.length === 1
            ? 'propiedad encontrada'
            : 'propiedades encontradas'}
        </p>

        <div className="mt-4 grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
          {filtered.map((p) => (
            <PropertyCard key={p.id} property={p} compact />
          ))}
        </div>
      </section>

      {/* Espacios publicitarios dobles */}
      <div className="mx-auto grid max-w-7xl gap-4 px-4 pt-12 md:grid-cols-2">
        <AdSlot />
        <AdSlot />
      </div>
    </div>
  )
}
