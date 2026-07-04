import { ChevronRight, MapPin } from 'lucide-react'
import { Link } from 'react-router-dom'
import { agencyZones } from '../data/mock'

export default function InmobiliariasList() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-base text-ink md:text-3xl">
        <ChevronRight className="h-7 w-7 text-accent" />
        Listado de inmobiliarias
      </h1>

      <div className="mt-10 grid gap-x-12 gap-y-10 md:grid-cols-2">
        {agencyZones.map((zone) => (
          <div key={zone.zone}>
            <h2 className="flex items-center gap-2 text-xl font-semibold tracking-base text-ink">
              <MapPin className="h-5 w-5 text-muted" />
              {zone.zone}
            </h2>
            <ul className="mt-4">
              {zone.cities.map((c) => (
                <li key={c.name}>
                  <Link
                    to={`/buscar?q=${encodeURIComponent(c.name)}`}
                    className="flex items-center justify-between border-b border-line py-3 text-sm text-ink transition-colors hover:text-brand"
                  >
                    <span>
                      {c.name}{' '}
                      <span className="text-muted">({c.count})</span>
                    </span>
                    <ChevronRight className="h-4 w-4 text-accent" />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  )
}
