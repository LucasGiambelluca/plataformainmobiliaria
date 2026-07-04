import { useState } from 'react'
import { Building2, ShieldCheck, Users, Zap } from 'lucide-react'
import Button from '../components/common/Button'
import Input from '../components/common/Input'

const volumeOptions = ['Hasta 50', 'Más de 50', 'Más de 200']

const features = [
  { icon: Building2, title: 'Portal exclusivo', text: 'Solo inmobiliarias matriculadas. No publicamos particulares ni franquicias.' },
  { icon: Users, title: 'Más visibilidad', text: 'Tus propiedades llegan a usuarios que buscan activamente en tu zona.' },
  { icon: Zap, title: 'Carga rápida', text: 'Importá tu cartera y publicá en minutos desde tu panel.' },
  { icon: ShieldCheck, title: 'Datos protegidos', text: 'Aislamiento por inmobiliaria y tu propia web con dominio propio.' },
]

export default function ComoPublicar() {
  const [volume, setVolume] = useState(volumeOptions[0])
  const [sent, setSent] = useState(false)

  return (
    <div>
      {/* Hero with form */}
      <section className="relative overflow-hidden bg-accent">
        <div className="absolute inset-0 bg-gradient-to-br from-accent-dark via-accent to-accent/70" />
        <div className="relative mx-auto grid max-w-7xl items-center gap-10 px-4 py-16 md:grid-cols-2">
          <div className="text-white">
            <h1 className="text-4xl font-bold leading-tight tracking-base md:text-5xl">
              Somos InmoHub
            </h1>
            <p className="mt-4 max-w-md text-xl font-medium text-white/95">
              El portal exclusivo de publicación inmobiliaria.
            </p>
            <p className="mt-2 text-sm text-white/80">
              No publicamos propiedades de particulares ni franquicias.
            </p>
          </div>

          {/* Consultanos form */}
          <div className="mx-auto w-full max-w-md rounded-xl bg-surface p-6 shadow-card-hover">
            <h2 className="text-center text-xl font-bold tracking-base text-ink">
              ¡Consultanos!
            </h2>

            {sent ? (
              <p className="mt-5 rounded-md bg-brand/10 p-4 text-center text-sm text-brand-dark">
                ¡Gracias! Recibimos tu consulta y te contactamos a la brevedad.
              </p>
            ) : (
              <form
                className="mt-5 space-y-3"
                onSubmit={(e) => {
                  e.preventDefault()
                  setSent(true)
                }}
              >
                <Input placeholder="Nombre de la inmobiliaria" required />
                <Input type="email" placeholder="Email" required />
                <Input type="tel" placeholder="Teléfono" />
                <Input placeholder="Nombre del matriculado a cargo" />

                <div>
                  <span className="mb-1.5 block text-sm font-medium text-ink">
                    ¿Cuántas propiedades quisieras publicar?
                  </span>
                  <div className="flex gap-2 rounded-md bg-canvas p-1">
                    {volumeOptions.map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setVolume(v)}
                        className={`flex-1 rounded-md px-2 py-2 text-xs font-medium transition-colors ${
                          volume === v
                            ? 'bg-brand text-white'
                            : 'text-ink hover:bg-line'
                        }`}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                </div>

                <textarea
                  placeholder="¿Algo más que quieras contarnos?"
                  rows={3}
                  className="w-full rounded-md border border-line bg-surface px-4 py-2.5 text-sm text-ink placeholder:text-muted focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                />
                <Button type="submit" className="w-full">
                  Enviar consulta
                </Button>
              </form>
            )}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-7xl px-4 py-16">
        <h2 className="text-center text-2xl font-semibold tracking-base text-ink md:text-[28px]">
          ¿Qué ofrecemos?
        </h2>
        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((f) => (
            <div
              key={f.title}
              className="rounded-lg border border-line bg-surface p-6 shadow-card"
            >
              <span className="grid h-11 w-11 place-items-center rounded-lg bg-brand/10">
                <f.icon className="h-5 w-5 text-brand" />
              </span>
              <h3 className="mt-4 text-base font-bold tracking-base text-ink">
                {f.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{f.text}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
