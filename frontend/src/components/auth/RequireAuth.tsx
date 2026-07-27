import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import type { UserRole } from '../../api/schemas'
import { homeFor, useAuth } from '../../store/auth'

interface Props {
  /** Roles habilitados para las rutas hijas. */
  roles: UserRole[]
}

/**
 * Portero de las rutas privadas. Se monta como ruta padre y renderiza el
 * <Outlet /> solo si hay sesión con el rol correcto.
 */
export default function RequireAuth({ roles }: Props) {
  const { user, status } = useAuth()
  const location = useLocation()

  // Todavía no sabemos si la cookie de refresh es válida: no se puede decidir.
  if (status === 'loading') {
    return (
      <div className="grid min-h-screen place-items-center bg-canvas">
        <Loader2 className="h-8 w-8 animate-spin text-brand" aria-label="Cargando" />
      </div>
    )
  }

  if (status === 'anonymous' || !user) {
    // Se guarda el destino para volver acá después del login.
    return <Navigate to="/login" state={{ from: location.pathname }} replace />
  }

  // Sesión válida pero del rol equivocado: al panel que sí le corresponde.
  if (!roles.includes(user.role)) {
    return <Navigate to={homeFor(user)} replace />
  }

  return <Outlet />
}
