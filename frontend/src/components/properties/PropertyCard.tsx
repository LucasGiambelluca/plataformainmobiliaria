import { Link } from 'react-router-dom'
import { Bath, BedDouble, Building2, Maximize, MapPin } from 'lucide-react'
import type { PublicPropertyCard } from '../../api/schemas'
import { formatPrice, operationLabels, typeLabels } from '../../lib/propertyLabels'

interface Props {
  property: PublicPropertyCard
  /** Variante compacta para la grilla de destacadas (ui.pdf). */
  compact?: boolean
}

/** Reemplazo cuando la propiedad todavía no tiene fotos cargadas. */
function SinFoto({ className = '' }: { className?: string }) {
  return (
    <div className={`grid h-full w-full place-items-center bg-canvas ${className}`}>
      <Building2 className="h-8 w-8 text-muted" aria-hidden />
    </div>
  )
}

export default function PropertyCard({ property, compact = false }: Props) {
  const ubicacion = [property.address, property.city].filter(Boolean).join(', ')

  if (compact) {
    return (
      <Link
        to={`/propiedad/${property.id}`}
        className="group flex flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-card transition-shadow duration-200 hover:shadow-card-hover"
      >
        <div className="m-2 aspect-square overflow-hidden rounded-lg">
          {property.coverUrl ? (
            <img
              src={property.coverUrl}
              alt={property.title}
              loading="lazy"
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
          ) : (
            <SinFoto />
          )}
        </div>
        <div className="flex flex-1 flex-col gap-1 px-3 pb-3">
          <h3 className="truncate text-sm text-ink" title={property.title}>
            {property.title}
          </h3>
          <span className="text-sm font-bold text-ink">
            {formatPrice(property.price, property.currency)}
          </span>
        </div>
      </Link>
    )
  }

  return (
    <Link
      to={`/propiedad/${property.id}`}
      className="group flex flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-card transition-shadow duration-200 hover:shadow-card-hover"
    >
      <div className="relative m-2 aspect-[4/3] overflow-hidden rounded-lg">
        {property.coverUrl ? (
          <img
            src={property.coverUrl}
            alt={property.title}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <SinFoto />
        )}
        <div className="absolute left-3 top-3 flex gap-2">
          <span className="rounded bg-brand px-3 py-1 text-xs font-medium text-white">
            {operationLabels[property.operationType]}
          </span>
          {property.featured && (
            <span className="rounded bg-accent px-3 py-1 text-xs font-medium text-white">
              Destacada
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-1 flex-col p-4 pt-2">
        <span className="text-xs font-medium uppercase tracking-base text-muted">
          {typeLabels[property.propertyType]}
        </span>
        <h3 className="mt-1 text-base font-semibold leading-snug text-ink">
          {property.title}
        </h3>
        {ubicacion && (
          <p className="mt-1 flex items-center gap-1 text-sm text-muted">
            <MapPin className="h-3.5 w-3.5 shrink-0" />
            {ubicacion}
          </p>
        )}

        <div className="mt-3 flex items-center gap-4 text-sm text-muted">
          {property.rooms !== null && property.rooms > 0 && (
            <span className="flex items-center gap-1">
              <BedDouble className="h-4 w-4" />
              {property.rooms}
            </span>
          )}
          {property.bathrooms !== null && property.bathrooms > 0 && (
            <span className="flex items-center gap-1">
              <Bath className="h-4 w-4" />
              {property.bathrooms}
            </span>
          )}
          {property.areaM2 !== null && (
            <span className="flex items-center gap-1">
              <Maximize className="h-4 w-4" />
              {Number(property.areaM2)} m²
            </span>
          )}
        </div>

        <div className="mt-4 flex items-center justify-between border-t border-line pt-3">
          <span className="text-base font-bold text-ink">
            {formatPrice(property.price, property.currency)}
          </span>
          <span className="truncate pl-2 text-xs text-muted">{property.agency.name}</span>
        </div>
      </div>
    </Link>
  )
}
