import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Building2, ChevronRight, Mail, MapPin, Phone, Search } from 'lucide-react'
import { EmptyState, ErrorState } from '../components/common/AsyncState'
import { AgencyDirectorySkeleton } from '../components/common/Skeleton'
import { useResource } from '../hooks/useResource'
import { useSeo } from '../hooks/useSeo'
import { getAgencies } from '../api/publicCatalog'
import type { PublicAgency } from '../api/schemas'

// Directorio de inmobiliarias contra la API real (tarea 4.7). Se agrupa por la
// localidad donde cada una publica más propiedades: el tenant no tiene domicilio
// en la base, y aunque lo tuviera diría dónde está la oficina, no dónde vende.

const SIN_LOCALIDAD = 'Sin propiedades publicadas'

function initials(name: string): string {
  const palabras = name.split(/\s+/).filter(Boolean)
  const mayusculas = palabras.filter((w) => /^\p{Lu}/u.test(w))
  const elegidas = (mayusculas.length > 0 ? mayusculas : palabras).slice(0, 2)
  return elegidas.map((w) => w[0]).join('').toUpperCase() || '?'
}

/** Localidad principal: donde más publica. Sin propiedades visibles, ninguna. */
function mainCity(a: PublicAgency): string {
  return a.cities[0] ?? SIN_LOCALIDAD
}

export default function InmobiliariasList() {
  const [city, setCity] = useState('Todas')
  const [query, setQuery] = useState('')

  const recurso = useResource(getAgencies, [])
  const agencies = useMemo(() => recurso.data ?? [], [recurso.data])

  useSeo({
    title: 'Directorio de inmobiliarias',
    description:
      'Todas las inmobiliarias de la plataforma, con sus datos de contacto y las localidades donde publican.',
    canonicalPath: '/inmobiliarias',
  })

  // Localidades con al menos una inmobiliaria, ordenadas por cuántas hay.
  const cityFilters = useMemo(() => {
    const cuenta = new Map<string, number>()
    for (const a of agencies) {
      for (const c of a.cities) cuenta.set(c, (cuenta.get(c) ?? 0) + 1)
    }
    return [
      'Todas',
      ...[...cuenta.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'es'))
        .map(([c]) => c),
    ]
  }, [agencies])

  const byCity = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtradas = agencies.filter(
      (a) =>
        (city === 'Todas' || a.cities.includes(city)) &&
        (!q ||
          a.name.toLowerCase().includes(q) ||
          a.cities.some((c) => c.toLowerCase().includes(q))),
    )

    const grupos = new Map<string, PublicAgency[]>()
    for (const a of filtradas) {
      // Con una localidad elegida, la inmobiliaria va en ese grupo aunque no sea
      // donde más publica: es el grupo que el usuario pidió ver.
      const clave = city === 'Todas' ? mainCity(a) : city
      const lista = grupos.get(clave) ?? []
      lista.push(a)
      grupos.set(clave, lista)
    }

    return [...grupos.entries()].sort(([a], [b]) => {
      // El cajón de las que no publican nada va último, siempre.
      if (a === SIN_LOCALIDAD) return 1
      if (b === SIN_LOCALIDAD) return -1
      return a.localeCompare(b, 'es')
    })
  }, [agencies, city, query])

  const total = byCity.reduce((n, [, lista]) => n + lista.length, 0)

  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      <h1 className="flex items-center gap-2 font-serif text-2xl font-semibold text-ink md:text-3xl">
        <ChevronRight className="h-7 w-7 text-accent" />
        Directorio de inmobiliarias
      </h1>

      {recurso.error && (
        <div className="mt-8">
          <ErrorState error={recurso.error} onRetry={recurso.reload} />
        </div>
      )}

      {recurso.loading && <AgencyDirectorySkeleton />}

      {!recurso.loading && !recurso.error && (
        <>
          {cityFilters.length > 1 && (
            <div className="mt-8 flex flex-wrap items-center gap-x-2 gap-y-3">
              {cityFilters.map((c) => (
                <button
                  key={c}
                  onClick={() => setCity(c)}
                  className={`rounded-pill px-4 py-1.5 font-serif text-[15px] transition-colors ${
                    city === c ? 'bg-brand text-white' : 'text-ink hover:text-accent-dark'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          )}

          <div className="relative mt-4 max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              placeholder="Buscar por nombre o localidad…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full rounded-md border border-line bg-surface py-2.5 pl-10 pr-4 text-sm text-ink placeholder:text-muted focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            />
          </div>

          <p className="mt-5 font-serif text-sm font-semibold text-muted">
            {total} {total === 1 ? 'inmobiliaria encontrada' : 'inmobiliarias encontradas'}
          </p>

          {byCity.map(([grupo, lista]) => (
            <section key={grupo} className="mt-8">
              <h2 className="flex items-center gap-2 border-l-4 border-accent pl-3 font-serif text-xl font-semibold text-ink">
                <MapPin className="h-5 w-5 text-muted" />
                {grupo}
                <span className="text-sm font-normal text-muted">({lista.length})</span>
              </h2>

              <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {lista.map((a) => (
                  <AgencyCard key={a.id} agency={a} />
                ))}
              </div>
            </section>
          ))}

          {total === 0 && (
            <div className="mt-10">
              <EmptyState>
                {agencies.length === 0
                  ? 'Todavía no hay inmobiliarias publicando en la plataforma.'
                  : 'No encontramos inmobiliarias con ese criterio. Probá con otra localidad o búsqueda.'}
              </EmptyState>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function AgencyCard({ agency }: { agency: PublicAgency }) {
  const visibles = agency.cities.slice(0, 3)
  const restantes = agency.cities.length - visibles.length

  return (
    <div className="flex flex-col rounded-xl border border-line bg-surface p-5 shadow-card transition-shadow hover:shadow-card-hover">
      <div className="flex items-center gap-3">
        {agency.logoUrl ? (
          <img
            src={agency.logoUrl}
            alt=""
            loading="lazy"
            className="h-11 w-11 shrink-0 rounded-full object-cover"
          />
        ) : (
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-brand font-serif text-base text-white">
            {initials(agency.name)}
          </span>
        )}
        <div className="min-w-0">
          <h3
            className="truncate font-serif text-base font-semibold text-ink"
            title={agency.name}
          >
            {agency.name}
          </h3>
          {visibles.length > 0 && (
            <p className="truncate text-xs text-muted" title={agency.cities.join(', ')}>
              {visibles.join(' · ')}
              {restantes > 0 && ` +${restantes}`}
            </p>
          )}
        </div>
      </div>

      {agency.description && (
        <p className="mt-3 line-clamp-2 text-sm text-muted">{agency.description}</p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-muted">
        {agency.contactPhone && (
          <span className="flex items-center gap-1.5">
            <Phone className="h-3.5 w-3.5" />
            {agency.contactPhone}
          </span>
        )}
        {agency.contactEmail && (
          <span className="flex min-w-0 items-center gap-1.5">
            <Mail className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{agency.contactEmail}</span>
          </span>
        )}
        <span className="flex items-center gap-1.5">
          <Building2 className="h-3.5 w-3.5" />
          {agency.propertiesCount}{' '}
          {agency.propertiesCount === 1 ? 'propiedad' : 'propiedades'}
        </span>
      </div>

      <div className="mt-auto flex flex-wrap gap-2 pt-4">
        <Link
          to={`/buscar?agency=${encodeURIComponent(agency.slug)}`}
          className="rounded bg-accent px-4 py-1.5 font-serif text-sm text-ink transition-colors hover:bg-accent-dark hover:text-white"
        >
          Ver propiedades
        </Link>
        {/* Solo si publicó su web: sin publicar, /inmobiliaria/:slug da 404. */}
        {agency.hasPublishedSite && (
          <Link
            to={`/inmobiliaria/${agency.slug}`}
            className="rounded border border-line px-4 py-1.5 font-serif text-sm text-ink transition-colors hover:border-brand hover:text-brand"
          >
            Su web
          </Link>
        )}
      </div>
    </div>
  )
}
