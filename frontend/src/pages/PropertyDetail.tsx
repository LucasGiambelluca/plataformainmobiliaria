import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  Bath,
  BedDouble,
  Building2,
  ChevronRight,
  Maximize,
  MapPin,
} from 'lucide-react'
import Button from '../components/common/Button'
import Input from '../components/common/Input'
import {
  formatPrice,
  operationLabels,
  properties,
  typeLabels,
} from '../data/mock'

const gallery = [
  'photo-1568605114967-8130f3a36994',
  'photo-1505691938895-1758d7feb511',
  'photo-1484154218962-a197022b5858',
  'photo-1502672260266-1c1ef2d93688',
]

export default function PropertyDetail() {
  const { id } = useParams()
  const property = properties.find((p) => p.id === id) ?? properties[0]
  const [active, setActive] = useState(0)
  const [sent, setSent] = useState(false)

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      {/* Breadcrumb */}
      <nav className="flex flex-wrap items-center gap-1 text-sm text-muted">
        <Link to="/" className="hover:text-brand">Inicio</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <Link to={`/buscar?op=${property.operation}`} className="hover:text-brand">
          {operationLabels[property.operation]}
        </Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-ink">{property.title}</span>
      </nav>

      <div className="mt-5 grid gap-8 lg:grid-cols-[1.6fr_1fr]">
        {/* Gallery + info */}
        <div>
          <div className="overflow-hidden rounded-lg border border-line">
            <img
              src={`https://images.unsplash.com/${gallery[active]}?auto=format&fit=crop&w=1000&q=75`}
              alt={property.title}
              className="aspect-[16/10] w-full object-cover"
            />
          </div>
          <div className="mt-3 grid grid-cols-4 gap-3">
            {gallery.map((g, i) => (
              <button
                key={g}
                onClick={() => setActive(i)}
                className={`overflow-hidden rounded-md border-2 transition-colors ${
                  active === i ? 'border-brand' : 'border-transparent'
                }`}
              >
                <img
                  src={`https://images.unsplash.com/${g}?auto=format&fit=crop&w=240&q=60`}
                  alt=""
                  className="aspect-[4/3] w-full object-cover"
                />
              </button>
            ))}
          </div>

          <div className="mt-6 rounded-lg border border-line bg-surface p-6 shadow-card">
            <span className="rounded-pill bg-brand px-3 py-1 text-xs font-medium text-white">
              {operationLabels[property.operation]} · {typeLabels[property.type]}
            </span>
            <h1 className="mt-3 text-2xl font-bold tracking-base text-ink">
              {property.title}
            </h1>
            <p className="mt-1 flex items-center gap-1 text-muted">
              <MapPin className="h-4 w-4" />
              {property.address}, {property.city}
            </p>
            <p className="mt-4 text-3xl font-bold tracking-base text-ink">
              {formatPrice(property)}
            </p>

            <div className="mt-6 flex flex-wrap gap-6 border-t border-line pt-5 text-sm text-ink">
              {property.rooms > 0 && (
                <span className="flex items-center gap-2">
                  <BedDouble className="h-5 w-5 text-brand" />
                  {property.rooms} ambientes
                </span>
              )}
              <span className="flex items-center gap-2">
                <Bath className="h-5 w-5 text-brand" />
                {property.bathrooms} baños
              </span>
              <span className="flex items-center gap-2">
                <Maximize className="h-5 w-5 text-brand" />
                {property.area} m²
              </span>
            </div>

            <div className="mt-6 border-t border-line pt-5">
              <h2 className="text-lg font-semibold tracking-base text-ink">
                Descripción
              </h2>
              <p className="mt-2 leading-relaxed text-muted">
                Excelente {typeLabels[property.type].toLowerCase()} ubicada en{' '}
                {property.city}. Espacios amplios y luminosos, ideal para
                familias. Cercana a comercios, transporte y escuelas. Consultá
                disponibilidad para coordinar una visita.
              </p>
            </div>

            <div className="mt-6 flex items-center gap-2 border-t border-line pt-5 text-sm text-muted">
              <Building2 className="h-4 w-4" />
              Publicado por <span className="font-medium text-ink">{property.agency}</span>
            </div>
          </div>
        </div>

        {/* Contact form */}
        <aside className="h-fit lg:sticky lg:top-24">
          <div className="rounded-lg border border-line bg-surface p-6 shadow-card">
            <h2 className="text-lg font-semibold tracking-base text-ink">
              Contactar a la inmobiliaria
            </h2>
            {sent ? (
              <p className="mt-4 rounded-md bg-brand/10 p-4 text-sm text-brand-dark">
                ¡Consulta enviada! La inmobiliaria se pondrá en contacto a la
                brevedad.
              </p>
            ) : (
              <form
                className="mt-4 space-y-3"
                onSubmit={(e) => {
                  e.preventDefault()
                  setSent(true)
                }}
              >
                <Input placeholder="Nombre y apellido" required />
                <Input type="email" placeholder="Email" required />
                <Input type="tel" placeholder="Teléfono" />
                <textarea
                  defaultValue={`Hola, me interesa la propiedad "${property.title}". ¿Podemos coordinar una visita?`}
                  rows={4}
                  className="w-full rounded-md border border-line bg-surface px-4 py-2.5 text-sm text-ink placeholder:text-muted focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                />
                <Button type="submit" className="w-full">
                  Enviar consulta
                </Button>
              </form>
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}
