import { Link } from 'react-router-dom'
import { Bath, BedDouble, Maximize, MapPin } from 'lucide-react'
import type { Property } from '../../types'
import { formatPrice, operationLabels, typeLabels } from '../../data/mock'

export default function PropertyCard({ property }: { property: Property }) {
  return (
    <Link
      to={`/propiedad/${property.id}`}
      className="group flex flex-col overflow-hidden rounded-lg border border-line bg-surface shadow-card transition-shadow duration-200 hover:shadow-card-hover"
    >
      <div className="relative aspect-[4/3] overflow-hidden">
        <img
          src={property.image}
          alt={property.title}
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
        <div className="absolute left-3 top-3 flex gap-2">
          <span className="rounded-pill bg-brand px-3 py-1 text-xs font-medium text-white">
            {operationLabels[property.operation]}
          </span>
          {property.discounted && (
            <span className="rounded-pill bg-accent px-3 py-1 text-xs font-medium text-white">
              Rebajada
            </span>
          )}
          {property.featured && !property.discounted && (
            <span className="rounded-pill bg-ink/80 px-3 py-1 text-xs font-medium text-white">
              Destacada
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-1 flex-col p-4">
        <span className="text-xs font-medium uppercase tracking-base text-muted">
          {typeLabels[property.type]}
        </span>
        <h3 className="mt-1 text-base font-bold leading-snug tracking-base text-ink">
          {property.title}
        </h3>
        <p className="mt-1 flex items-center gap-1 text-sm text-muted">
          <MapPin className="h-3.5 w-3.5" />
          {property.address}, {property.city}
        </p>

        <div className="mt-3 flex items-center gap-4 text-sm text-muted">
          {property.rooms > 0 && (
            <span className="flex items-center gap-1">
              <BedDouble className="h-4 w-4" />
              {property.rooms}
            </span>
          )}
          <span className="flex items-center gap-1">
            <Bath className="h-4 w-4" />
            {property.bathrooms}
          </span>
          <span className="flex items-center gap-1">
            <Maximize className="h-4 w-4" />
            {property.area} m²
          </span>
        </div>

        <div className="mt-4 flex items-center justify-between border-t border-line pt-3">
          <span className="text-base font-bold tracking-base text-ink">
            {formatPrice(property)}
          </span>
          <span className="text-xs text-muted">{property.agency}</span>
        </div>
      </div>
    </Link>
  )
}
