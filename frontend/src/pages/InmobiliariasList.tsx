import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Building2, ChevronRight, MapPin, Phone, Search } from 'lucide-react'
import { agencies, agencyZones } from '../data/mock'

// Directorio de inmobiliarias de Entre Ríos agrupado por ciudad, con
// búsqueda por nombre/ciudad y filtro por zona.

const zoneFilters = ['Todas', ...agencyZones.map((z) => z.zone)]

function initials(name: string): string {
  return name
    .split(' ')
    .filter((w) => /^[A-ZÁÉÍÓÚÑ]/.test(w))
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
}

export default function InmobiliariasList() {
  const [zone, setZone] = useState('Todas')
  const [query, setQuery] = useState('')

  const byCity = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = agencies.filter(
      (a) =>
        (zone === 'Todas' || a.zone === zone) &&
        (!q ||
          a.name.toLowerCase().includes(q) ||
          a.city.toLowerCase().includes(q)),
    )
    const groups = new Map<string, typeof filtered>()
    for (const a of filtered) {
      const list = groups.get(a.city) ?? []
      list.push(a)
      groups.set(a.city, list)
    }
    return [...groups.entries()]
  }, [zone, query])

  const total = byCity.reduce((n, [, list]) => n + list.length, 0)

  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      <h1 className="flex items-center gap-2 font-serif text-2xl font-semibold text-ink md:text-3xl">
        <ChevronRight className="h-7 w-7 text-accent" />
        Directorio de inmobiliarias de Entre Ríos
      </h1>

      {/* Filtros */}
      <div className="mt-8 flex flex-wrap items-center gap-x-2 gap-y-3">
        {zoneFilters.map((z) => (
          <button
            key={z}
            onClick={() => setZone(z)}
            className={`rounded-pill px-4 py-1.5 font-serif text-[15px] transition-colors ${
              zone === z
                ? 'bg-brand text-white'
                : 'text-ink hover:text-accent-dark'
            }`}
          >
            {z}
          </button>
        ))}
      </div>

      <div className="relative mt-4 max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <input
          placeholder="Buscar por nombre o ciudad…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full rounded-md border border-line bg-surface py-2.5 pl-10 pr-4 text-sm text-ink placeholder:text-muted focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
        />
      </div>

      <p className="mt-5 font-serif text-sm font-semibold text-muted">
        {total}{' '}
        {total === 1 ? 'inmobiliaria encontrada' : 'inmobiliarias encontradas'}
      </p>

      {/* Directorio agrupado por ciudad */}
      {byCity.map(([city, list]) => (
        <section key={city} className="mt-8">
          <h2 className="flex items-center gap-2 border-l-4 border-accent pl-3 font-serif text-xl font-semibold text-ink">
            <MapPin className="h-5 w-5 text-muted" />
            {city}
            <span className="text-sm font-normal text-muted">
              ({list.length})
            </span>
          </h2>

          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((a) => (
              <div
                key={a.id}
                className="flex flex-col rounded-xl border border-line bg-surface p-5 shadow-card transition-shadow hover:shadow-card-hover"
              >
                <div className="flex items-center gap-3">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-brand font-serif text-base text-white">
                    {initials(a.name)}
                  </span>
                  <div className="min-w-0">
                    <h3
                      className="truncate font-serif text-base font-semibold text-ink"
                      title={a.name}
                    >
                      {a.name}
                    </h3>
                    <p className="text-xs text-muted">
                      {a.address}, {a.city}
                    </p>
                  </div>
                </div>

                <div className="mt-4 flex items-center gap-4 text-sm text-muted">
                  <span className="flex items-center gap-1.5">
                    <Phone className="h-3.5 w-3.5" />
                    {a.phone}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Building2 className="h-3.5 w-3.5" />
                    {a.propertiesCount} propiedades
                  </span>
                </div>

                <Link
                  to={`/buscar?q=${encodeURIComponent(a.city)}`}
                  className="mt-4 self-start rounded bg-accent px-4 py-1.5 font-serif text-sm text-ink transition-colors hover:bg-accent-dark hover:text-white"
                >
                  Ver propiedades
                </Link>
              </div>
            ))}
          </div>
        </section>
      ))}

      {total === 0 && (
        <p className="mt-10 text-muted">
          No encontramos inmobiliarias con ese criterio. Probá con otra zona o
          búsqueda.
        </p>
      )}
    </div>
  )
}
