import { useState } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import { Bell, LogOut, Menu, ShieldAlert, UserCircle } from 'lucide-react'
import Sidebar, { type NavItem } from './Sidebar'
import { useAuth } from '../../store/auth'
import type { UserRole } from '../../api/schemas'

interface Props {
  brandHome: string
  title: string
  subtitle: string
  items: NavItem[]
}

const roleLabels: Record<UserRole, string> = {
  super_admin: 'Super Admin',
  tenant_admin: 'Administrador',
  agent: 'Agente',
}

// Chrome compartido de dashboard (sidebar + header) que usan el panel de
// inmobiliaria y el de Super Admin.
export default function DashShell({ brandHome, title, subtitle, items }: Props) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const navigate = useNavigate()
  const user = useAuth((s) => s.user)
  const logout = useAuth((s) => s.logout)
  const impersonation = useAuth((s) => s.impersonation)
  const stopImpersonation = useAuth((s) => s.stopImpersonation)

  const handleLogout = async () => {
    await logout()
    navigate('/login', { replace: true })
  }

  const handleStopImpersonation = async () => {
    await stopImpersonation()
    navigate('/admin/inmobiliarias', { replace: true })
  }

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      {impersonation && (
        // Colores propios, NO las variables --brand: el panel se re-tematiza
        // con los colores de cada inmobiliaria y el aviso tiene que gritar por
        // encima de ese tema, no integrarse a él.
        //
        // No es sticky a propósito: el header sí lo es, y dos elementos pegados
        // arriba se pisan. Al hacer scroll el aviso se va, pero el botón de
        // salida queda en el header.
        <div className="flex flex-wrap items-center justify-between gap-2 bg-amber-500 px-4 py-2 text-sm text-amber-950">
          <p className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 shrink-0" />
            <span>
              Estás viendo el panel de <strong>{impersonation.tenant.name}</strong> como
              soporte · solo lectura · vence{' '}
              {new Date(impersonation.expiresAt).toLocaleTimeString('es-AR', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          </p>
          <button
            onClick={() => void handleStopImpersonation()}
            className="rounded-md bg-amber-950 px-3 py-1 font-medium text-amber-50 hover:bg-amber-900"
          >
            Volver al admin
          </button>
        </div>
      )}

      <div className="flex min-w-0 flex-1">
        <Sidebar
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          brandHome={brandHome}
          title={title}
          subtitle={subtitle}
          items={items}
        />

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 flex items-center justify-between border-b border-line bg-surface px-4 py-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="text-ink lg:hidden"
              aria-label="Menú"
            >
              <Menu className="h-6 w-6" />
            </button>
            <div className="hidden lg:block" />

            <div className="flex items-center gap-4">
              <button className="relative text-muted hover:text-ink" aria-label="Notificaciones">
                <Bell className="h-5 w-5" />
                <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-accent" />
              </button>
              <div className="flex items-center gap-2">
                <UserCircle className="h-7 w-7 text-muted" />
                <div className="hidden text-sm leading-tight sm:block">
                  <p className="font-medium text-ink">{user?.name ?? user?.email ?? '—'}</p>
                  <p className="text-xs text-muted">
                    {user ? roleLabels[user.role] : ''}
                  </p>
                </div>
              </div>

              {/* Suplantando, "Salir" cerraría la sesión REAL del super admin:
                  logout trabaja sobre la cookie, que nunca dejó de ser la suya.
                  Los dos botones no conviven — primero se sale, después uno se
                  va. La protección es de interfaz: el backend no puede
                  distinguir el caso porque /auth/logout no pasa por
                  authenticate. */}
              {impersonation ? (
                <button
                  onClick={() => void handleStopImpersonation()}
                  className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium text-amber-700 hover:bg-amber-50"
                >
                  <ShieldAlert className="h-4 w-4" />
                  <span className="hidden sm:inline">Volver al admin</span>
                </button>
              ) : (
                <button
                  onClick={() => void handleLogout()}
                  className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-muted hover:bg-canvas hover:text-ink"
                >
                  <LogOut className="h-4 w-4" />
                  <span className="hidden sm:inline">Salir</span>
                </button>
              )}
            </div>
          </header>

          <main className="flex-1 p-4 md:p-6">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  )
}
