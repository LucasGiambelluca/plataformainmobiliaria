import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search } from 'lucide-react'
import Select from '../components/common/Select'
import Button from '../components/common/Button'
import PropertyCard from '../components/properties/PropertyCard'
import { featuredProperties, typeLabels } from '../data/mock'
import type { Operation } from '../types'

const tabs: { key: Operation; label: string }[] = [
  { key: 'venta', label: 'Venta' },
  { key: 'alquiler', label: 'Alquiler' },
  { key: 'temporal', label: 'Temporal' },
]

const typeOptions = Object.entries(typeLabels).map(([value, label]) => ({
  value,
  label,
}))

export default function Home() {
  const navigate = useNavigate()
  const [op, setOp] = useState<Operation>('venta')
  const [type, setType] = useState('')
  const [location, setLocation] = useState('')

  const search = () => {
    const params = new URLSearchParams({ op })
    if (type) params.set('type', type)
    if (location) params.set('q', location)
    navigate(`/buscar?${params.toString()}`)
  }

  return (
    <div>
      {/* Hero */}
      <section className="relative">
        <div className="absolute inset-0">
          <img
            src="https://images.unsplash.com/photo-1560518883-ce09059eeffa?auto=format&fit=crop&w=1600&q=70"
            alt=""
            className="h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-topbar/90 via-topbar/70 to-brand/40" />
        </div>

        <div className="relative mx-auto max-w-7xl px-4 py-20 md:py-28">
          <h1 className="max-w-2xl text-3xl font-bold leading-tight tracking-base text-white md:text-5xl">
            Encontrá la propiedad ideal para vos
          </h1>
          <p className="mt-3 max-w-xl text-lg text-white/85">
            Alquiler, venta y temporal de propiedades en todas las inmobiliarias
            de la red.
          </p>

          {/* Search card */}
          <div className="mt-8 max-w-4xl rounded-xl bg-surface p-4 shadow-card-hover">
            <div className="mb-4 flex gap-2">
              {tabs.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setOp(t.key)}
                  className={`rounded-pill px-5 py-2 text-sm font-medium tracking-base transition-colors ${
                    op === t.key
                      ? 'bg-brand text-white'
                      : 'bg-canvas text-ink hover:bg-line'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
              <Select
                placeholder="Tipo de propiedad"
                options={typeOptions}
                value={type}
                onChange={(e) => setType(e.target.value)}
              />
              <input
                placeholder="Ingresá una localidad o zona"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="w-full rounded-md border border-line bg-surface px-4 py-2.5 text-sm text-ink placeholder:text-muted focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
              />
              <Button onClick={search} className="md:px-8">
                <Search className="h-4 w-4" />
                Buscar
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Featured */}
      <section className="mx-auto max-w-7xl px-4 py-14">
        <h2 className="text-2xl font-semibold tracking-base text-ink md:text-[28px]">
          Propiedades destacadas y rebajadas
        </h2>
        <p className="mt-1 text-muted">Lo más buscado de la semana.</p>

        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {featuredProperties.map((p) => (
            <PropertyCard key={p.id} property={p} />
          ))}
        </div>
      </section>

      {/* Buscamos por vos CTA */}
      <section className="bg-canvas">
        <div className="mx-auto flex max-w-7xl flex-col items-center gap-6 px-4 py-14 text-center md:flex-row md:text-left">
          <div className="flex-1">
            <h2 className="text-2xl font-semibold tracking-base text-ink md:text-[28px]">
              ¿No encontrás lo que buscás?
            </h2>
            <p className="mt-2 max-w-xl text-muted">
              Completá el formulario «Buscamos por vos» y enviamos tu consulta a
              todas las inmobiliarias que coincidan con tu selección. Una única
              consulta, muchos destinatarios.
            </p>
          </div>
          <Button
            variant="accent"
            className="md:px-8"
            onClick={() => navigate('/publicar')}
          >
            Buscamos por vos
          </Button>
        </div>
      </section>
    </div>
  )
}
