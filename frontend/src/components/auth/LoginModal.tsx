import { Link, useNavigate } from 'react-router-dom'
import { X } from 'lucide-react'
import LoginForm from './LoginForm'
import { homeFor } from '../../store/auth'

interface Props {
  open: boolean
  onClose: () => void
}

export default function LoginModal({ open, onClose }: Props) {
  const navigate = useNavigate()

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-24"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl bg-surface p-6 shadow-card-hover"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-semibold text-ink">Ingresá a tu cuenta</h2>
            <p className="mt-1 text-sm text-muted">
              Panel de tu inmobiliaria: propiedades, leads y suscripción.
            </p>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="text-muted hover:text-ink">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-6">
          <LoginForm
            onSuccess={(user) => {
              onClose()
              navigate(homeFor(user))
            }}
          />
        </div>

        <p className="mt-6 text-center text-sm text-muted">
          ¿No tenés cuenta?{' '}
          <Link to="/registro" onClick={onClose} className="font-medium text-brand hover:underline">
            Registrá tu inmobiliaria
          </Link>
        </p>
      </div>
    </div>
  )
}
