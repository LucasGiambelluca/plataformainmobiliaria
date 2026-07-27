import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Building2, Globe, Loader2, Mail, MessageSquare, Users } from 'lucide-react'
import Button from '../components/common/Button'
import Input from '../components/common/Input'
import { registerFormSchema, type RegisterForm } from '../api/schemas'
import { ApiError } from '../lib/apiError'
import { homeFor, useAuth } from '../store/auth'

const benefits = [
  { icon: Building2, text: 'Cargá tus propiedades y publicalas en minutos.' },
  { icon: Globe, text: 'Tu web propia con tu marca, incluida en el plan.' },
  { icon: Users, text: 'Sumá agentes y respondé consultas desde un solo panel.' },
]

/** "Inmobiliaria Norte" → "inmobiliaria-norte" (mismas reglas que slugSchema). */
function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100)
}

export default function Register() {
  const navigate = useNavigate()
  const registerTenant = useAuth((s) => s.register)
  const [showForm, setShowForm] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    setValue,
    setError,
    getFieldState,
    formState: { errors, isSubmitting },
  } = useForm<RegisterForm>({ resolver: zodResolver(registerFormSchema) })

  const onSubmit = handleSubmit(async (values) => {
    setFailure(null)
    try {
      const user = await registerTenant(values)
      navigate(homeFor(user), { replace: true })
    } catch (err) {
      if (err instanceof ApiError) {
        // 409 (slug o email ya usados) y 422 traen el campo exacto.
        let field = false
        for (const key of ['tenantName', 'slug', 'email', 'password', 'name'] as const) {
          const issue = err.issueFor(key)
          if (issue) {
            setError(key, { message: issue })
            field = true
          }
        }
        if (!field) setFailure(err.message)
        return
      }
      setFailure('No se pudo completar el registro')
    }
  })

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden bg-brand">
        <div className="absolute inset-0 bg-gradient-to-br from-brand-dark via-brand to-brand-light/60" />
        <div className="relative mx-auto grid max-w-7xl items-center gap-10 px-4 py-16 md:grid-cols-2">
          <div className="text-white">
            <h1 className="text-3xl font-bold leading-tight tracking-base md:text-4xl">
              Publicá tus propiedades con tu propia marca
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

          {/* Alta de inmobiliaria */}
          <div className="mx-auto w-full max-w-md rounded-xl bg-surface p-6 shadow-card-hover">
            <h2 className="text-center text-xl font-bold tracking-base text-brand">
              Registrá tu inmobiliaria
            </h2>

            {!showForm ? (
              <div className="mt-5 space-y-3">
                <p className="text-center text-sm text-muted">
                  Creás la cuenta, quedás con el plan Básico activo y entrás
                  directo al panel.
                </p>
                <button
                  onClick={() => setShowForm(true)}
                  className="flex w-full items-center justify-center gap-3 rounded-md bg-brand px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-dark"
                >
                  <Mail className="h-4 w-4" />
                  Empezar registro
                </button>
                <p className="pt-2 text-center text-sm text-muted">
                  ¿Ya tenés una cuenta?{' '}
                  <Link to="/login" className="font-medium text-brand hover:underline">
                    Iniciá sesión
                  </Link>
                </p>
              </div>
            ) : (
              <form className="mt-5 space-y-3" onSubmit={onSubmit} noValidate>
                {failure && (
                  <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                    {failure}
                  </p>
                )}

                <Input
                  label="Nombre de la inmobiliaria"
                  placeholder="Inmobiliaria Norte"
                  error={errors.tenantName?.message}
                  {...register('tenantName', {
                    onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
                      // El slug se autocompleta hasta que el usuario lo edita.
                      if (!getFieldState('slug').isDirty) {
                        setValue('slug', slugify(e.target.value))
                      }
                    },
                  })}
                />
                <Input
                  label="Dirección de tu web"
                  placeholder="inmobiliaria-norte"
                  error={errors.slug?.message}
                  {...register('slug')}
                />
                <Input
                  label="Tu nombre"
                  placeholder="Ana Gómez"
                  error={errors.name?.message}
                  {...register('name')}
                />
                <Input
                  label="Email"
                  type="email"
                  autoComplete="email"
                  error={errors.email?.message}
                  {...register('email')}
                />
                <Input
                  label="Contraseña"
                  type="password"
                  autoComplete="new-password"
                  error={errors.password?.message}
                  {...register('password')}
                />

                <Button type="submit" className="w-full" disabled={isSubmitting}>
                  {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                  {isSubmitting ? 'Creando cuenta…' : 'Crear cuenta'}
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
            Todas tus consultas en un lugar
          </h2>
          <p className="mt-3 leading-relaxed text-muted">
            Las consultas que llegan desde el catálogo y desde tu web propia
            caen en la misma bandeja, con el detalle de qué propiedad las
            originó.
          </p>
        </div>
        <div className="rounded-xl border border-line bg-surface p-8 shadow-card">
          <Globe className="h-10 w-10 text-accent" />
          <h2 className="mt-4 text-2xl font-semibold tracking-base text-ink">
            Tu web, tu dominio
          </h2>
          <p className="mt-3 leading-relaxed text-muted">
            Cada inmobiliaria tiene su sitio con carrousel, colores propios y la
            opción de conectar su dominio con certificado SSL automático.
          </p>
        </div>
      </section>
    </div>
  )
}
