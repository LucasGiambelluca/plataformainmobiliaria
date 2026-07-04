import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Bell, Clock, Mail, MessageSquare, UserPlus } from 'lucide-react'
import Button from '../components/common/Button'
import Input from '../components/common/Input'

const benefits = [
  { icon: UserPlus, text: 'Creá tu cuenta en sólo unos minutos.' },
  { icon: Clock, text: 'Disfrutá tu panel a cualquier hora, en cualquier lugar.' },
  { icon: Bell, text: 'Generá alertas y recibí avisos de nuevas propiedades.' },
]

export default function Register() {
  const [showForm, setShowForm] = useState(false)

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden bg-brand">
        <div className="absolute inset-0 bg-gradient-to-br from-brand-dark via-brand to-brand-light/60" />
        <div className="relative mx-auto grid max-w-7xl items-center gap-10 px-4 py-16 md:grid-cols-2">
          <div className="text-white">
            <h1 className="text-3xl font-bold leading-tight tracking-base md:text-4xl">
              ¡Conocé los beneficios de registrarte!
            </h1>
            <ul className="mt-6 space-y-3">
              {benefits.map((b) => (
                <li key={b.text} className="flex items-center gap-3 text-white/90">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/15">
                    <b.icon className="h-4 w-4" />
                  </span>
                  {b.text}
                </li>
              ))}
            </ul>
          </div>

          {/* Register card */}
          <div className="mx-auto w-full max-w-md rounded-xl bg-surface p-6 shadow-card-hover">
            <h2 className="text-center text-xl font-bold tracking-base text-brand">
              ¡Registrate gratis!
            </h2>

            {!showForm ? (
              <div className="mt-5 space-y-3">
                <button className="flex w-full items-center justify-center gap-3 rounded-md border border-line bg-surface px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-canvas">
                  Ingresá con tu cuenta de Google
                </button>
                <button
                  onClick={() => setShowForm(true)}
                  className="flex w-full items-center justify-center gap-3 rounded-md bg-brand px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-dark"
                >
                  <Mail className="h-4 w-4" />
                  O completá nuestro formulario
                </button>
                <p className="pt-2 text-center text-sm text-muted">
                  ¿Ya tenés una cuenta?{' '}
                  <Link to="/" className="font-medium text-brand hover:underline">
                    Iniciá sesión
                  </Link>
                </p>
              </div>
            ) : (
              <form
                className="mt-5 space-y-3"
                onSubmit={(e) => e.preventDefault()}
              >
                <Input placeholder="Nombre y apellido" required />
                <Input type="email" placeholder="Email" required />
                <Input type="tel" placeholder="Teléfono" />
                <Input type="password" placeholder="Contraseña" required />
                <Button type="submit" className="w-full">
                  Crear cuenta
                </Button>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="w-full text-center text-sm text-muted hover:text-ink"
                >
                  Volver
                </button>
              </form>
            )}
          </div>
        </div>
      </section>

      {/* Value prop */}
      <section className="mx-auto grid max-w-7xl items-center gap-10 px-4 py-16 md:grid-cols-2">
        <div className="rounded-xl border border-line bg-surface p-8 shadow-card">
          <MessageSquare className="h-10 w-10 text-brand" />
          <h2 className="mt-4 text-2xl font-semibold tracking-base text-ink">
            ¡Ahorrá tiempo de búsqueda!
          </h2>
          <p className="mt-3 leading-relaxed text-muted">
            Completá el formulario en la sección «Buscamos por vos» y nosotros
            enviamos tu consulta a todas las inmobiliarias que coincidan con tu
            selección. Una única consulta, muchos destinatarios.
          </p>
        </div>
        <div className="rounded-xl border border-line bg-surface p-8 shadow-card">
          <Bell className="h-10 w-10 text-accent" />
          <h2 className="mt-4 text-2xl font-semibold tracking-base text-ink">
            Generá alertas
          </h2>
          <p className="mt-3 leading-relaxed text-muted">
            Guardá tus búsquedas y recibí un aviso por email apenas se publique
            una propiedad que cumpla con lo que estás buscando.
          </p>
        </div>
      </section>
    </div>
  )
}
