import { lazy, Suspense, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  Bath,
  BedDouble,
  Building2,
  Car,
  ChevronRight,
  Eye,
  Maximize,
  MapPin,
  Play,
} from 'lucide-react'
import ContactForm from '../components/properties/ContactForm'
import { ErrorState } from '../components/common/AsyncState'
import { PropertyDetailSkeleton, Skeleton } from '../components/common/Skeleton'
import { useResource } from '../hooks/useResource'
import { useSeo } from '../hooks/useSeo'
import { getPublicProperty } from '../api/publicCatalog'
import { formatPrice, operationLabels, typeLabels } from '../lib/propertyLabels'
import { propertyJsonLd, propertySummary } from '../lib/seo'

// Leaflet pesa lo suyo y solo lo usa esta pantalla: se carga aparte, cuando la
// propiedad resultó tener coordenadas.
const PropertyMap = lazy(() => import('../components/properties/PropertyMap'))

export default function PropertyDetail() {
  const { id } = useParams()
  const [active, setActive] = useState(0)

  const recurso = useResource(() => getPublicProperty(id as string), [id])
  const datos = recurso.data

  const canonicalPath = `/propiedad/${id}`
  const portada = datos?.media.find((m) => m.type === 'image')

  useSeo({
    title: datos?.title ?? 'Propiedad',
    description: datos ? (datos.description ?? propertySummary(datos)) : null,
    canonicalPath,
    image: portada?.url ?? null,
    type: 'article',
    jsonLd: datos
      ? propertyJsonLd(datos, window.location.origin + canonicalPath)
      : null,
  })

  if (recurso.error) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <ErrorState error={recurso.error} onRetry={recurso.reload} />
        <p className="mt-4 text-center">
          <Link to="/buscar" className="text-brand hover:underline">
            Ver otras propiedades
          </Link>
        </p>
      </div>
    )
  }

  if (recurso.loading || !datos) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-6">
        <PropertyDetailSkeleton />
      </div>
    )
  }

  const property = datos
  const ubicacion = [property.address, property.city, property.state]
    .filter(Boolean)
    .join(', ')
  const galeria = property.media
  const principal = galeria[active] ?? galeria[0]

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <nav className="flex flex-wrap items-center gap-1 text-sm text-muted">
        <Link to="/" className="hover:text-brand">
          Inicio
        </Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <Link to={`/buscar?op=${property.operationType}`} className="hover:text-brand">
          {operationLabels[property.operationType]}
        </Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-ink">{property.title}</span>
      </nav>

      <div className="mt-5 grid gap-8 lg:grid-cols-[1.6fr_1fr]">
        <div>
          <div className="overflow-hidden rounded-lg border border-line">
            {principal?.type === 'video' ? (
              // `key` fuerza a React a rehacer el elemento al cambiar de
              // archivo: sin eso el reproductor sigue mostrando el video
              // anterior cuando se elige otro en la galería.
              <video
                key={principal.id}
                src={principal.url}
                poster={principal.thumbnailUrl ?? undefined}
                controls
                preload="metadata"
                playsInline
                className="aspect-[16/10] w-full bg-black object-contain"
              />
            ) : principal ? (
              <img
                src={principal.url}
                alt={property.title}
                className="aspect-[16/10] w-full object-cover"
              />
            ) : (
              <div className="grid aspect-[16/10] w-full place-items-center bg-canvas">
                <Building2 className="h-12 w-12 text-muted" aria-hidden />
              </div>
            )}
          </div>

          {galeria.length > 1 && (
            <div className="mt-3 grid grid-cols-4 gap-3">
              {galeria.map((m, i) => (
                <button
                  key={m.id}
                  onClick={() => setActive(i)}
                  className={`overflow-hidden rounded-md border-2 transition-colors ${
                    active === i ? 'border-brand' : 'border-transparent'
                  }`}
                >
                  <span className="relative block">
                    {m.type === 'video' && !m.thumbnailUrl ? (
                      <video
                        src={m.url}
                        preload="metadata"
                        muted
                        playsInline
                        className="aspect-[4/3] w-full bg-black object-cover"
                      />
                    ) : (
                      <img
                        src={m.thumbnailUrl ?? m.url}
                        alt=""
                        loading="lazy"
                        className="aspect-[4/3] w-full object-cover"
                      />
                    )}
                    {m.type === 'video' && (
                      <span className="absolute inset-0 grid place-items-center">
                        <span className="grid h-8 w-8 place-items-center rounded-full bg-black/60">
                          <Play className="h-4 w-4 fill-white text-white" aria-hidden />
                        </span>
                      </span>
                    )}
                  </span>
                </button>
              ))}
            </div>
          )}

          <div className="mt-6 rounded-lg border border-line bg-surface p-6 shadow-card">
            <span className="rounded-pill bg-brand px-3 py-1 text-xs font-medium text-white">
              {operationLabels[property.operationType]} ·{' '}
              {typeLabels[property.propertyType]}
            </span>
            <h1 className="mt-3 text-2xl font-bold tracking-base text-ink">
              {property.title}
            </h1>
            {ubicacion && (
              <p className="mt-1 flex items-center gap-1 text-muted">
                <MapPin className="h-4 w-4" />
                {ubicacion}
              </p>
            )}
            <p className="mt-4 text-3xl font-bold tracking-base text-ink">
              {formatPrice(property.price, property.currency)}
            </p>

            <div className="mt-6 flex flex-wrap gap-6 border-t border-line pt-5 text-sm text-ink">
              {property.rooms !== null && property.rooms > 0 && (
                <span className="flex items-center gap-2">
                  <BedDouble className="h-5 w-5 text-brand" />
                  {property.rooms} ambientes
                </span>
              )}
              {property.bathrooms !== null && property.bathrooms > 0 && (
                <span className="flex items-center gap-2">
                  <Bath className="h-5 w-5 text-brand" />
                  {property.bathrooms} baños
                </span>
              )}
              {property.parking !== null && property.parking > 0 && (
                <span className="flex items-center gap-2">
                  <Car className="h-5 w-5 text-brand" />
                  {property.parking} cocheras
                </span>
              )}
              {property.areaM2 !== null && (
                <span className="flex items-center gap-2">
                  <Maximize className="h-5 w-5 text-brand" />
                  {Number(property.areaM2)} m²
                </span>
              )}
            </div>

            {property.description && (
              <div className="mt-6 border-t border-line pt-5">
                <h2 className="text-lg font-semibold tracking-base text-ink">
                  Descripción
                </h2>
                <p className="mt-2 whitespace-pre-line leading-relaxed text-muted">
                  {property.description}
                </p>
              </div>
            )}

            {property.features.length > 0 && (
              <div className="mt-6 border-t border-line pt-5">
                <h2 className="text-lg font-semibold tracking-base text-ink">
                  Características
                </h2>
                <ul className="mt-3 flex flex-wrap gap-2">
                  {property.features.map((f) => (
                    <li
                      key={f}
                      className="rounded-pill border border-line px-3 py-1 text-sm text-ink"
                    >
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Sin coordenadas no hay sección: un mapa centrado en el país no
                dice nada y ocupa media pantalla. */}
            {property.lat && property.lng && (
              <Suspense fallback={<Skeleton className="mt-6 h-72 w-full rounded-lg md:h-96" />}>
                <PropertyMap
                  lat={property.lat}
                  lng={property.lng}
                  title={property.title}
                  address={ubicacion || null}
                />
              </Suspense>
            )}

            <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5 text-sm text-muted">
              <span className="flex items-center gap-2">
                <Building2 className="h-4 w-4" />
                Publicado por{' '}
                <span className="font-medium text-ink">{property.agency.name}</span>
              </span>
              <span className="flex items-center gap-1.5">
                <Eye className="h-4 w-4" />
                {property.viewsCount} vistas
              </span>
            </div>
          </div>
        </div>

        <aside className="h-fit lg:sticky lg:top-24">
          <div className="rounded-lg border border-line bg-surface p-6 shadow-card">
            <h2 className="text-lg font-semibold tracking-base text-ink">
              Contactar a la inmobiliaria
            </h2>
            <ContactForm propertyId={property.id} propertyTitle={property.title} />

            {(property.agencyContact.email || property.agencyContact.phone) && (
              <div className="mt-5 border-t border-line pt-4 text-sm text-muted">
                <p className="font-medium text-ink">{property.agency.name}</p>
                {property.agencyContact.email && <p>{property.agencyContact.email}</p>}
                {property.agencyContact.phone && <p>{property.agencyContact.phone}</p>}
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}
