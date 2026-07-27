import { useEffect } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import LoginForm from '../components/auth/LoginForm'
import Logo from '../components/common/Logo'
import { homeFor, useAuth } from '../store/auth'

interface LocationState {
  from?: string
}

export default function Login() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, status } = useAuth()

  const from = (location.state as LocationState | null)?.from

  // Si ya hay sesión (por ejemplo, se entró a /login a mano), no tiene sentido
  // mostrar el formulario.
  useEffect(() => {
    if (status === 'authenticated' && user) {
      navigate(from ?? homeFor(user), { replace: true })
    }
  }, [status, user, from, navigate])

  return (
    <div className="grid min-h-screen place-items-center bg-canvas px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Link to="/">
            <Logo />
          </Link>
        </div>

        <div className="rounded-xl border border-line bg-surface p-6 shadow-card">
          <h1 className="text-xl font-semibold tracking-base text-ink">
            Ingresá a tu panel
          </h1>
          <p className="mb-5 mt-1 text-sm text-muted">
            Acceso para inmobiliarias y administradores de la plataforma.
          </p>

          <LoginForm
            onSuccess={(user) => navigate(from ?? homeFor(user), { replace: true })}
          />
        </div>

        <p className="mt-6 text-center text-sm text-muted">
          ¿Todavía no publicás con nosotros?{' '}
          <Link to="/registro" className="font-medium text-brand hover:underline">
            Registrá tu inmobiliaria
          </Link>
        </p>
      </div>
    </div>
  )
}
