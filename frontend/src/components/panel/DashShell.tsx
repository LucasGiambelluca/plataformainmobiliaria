import { useState } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import { Bell, LogOut, Menu, UserCircle } from 'lucide-react'
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

  const handleLogout = async () => {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="flex min-h-screen bg-canvas">
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
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-muted hover:bg-canvas hover:text-ink"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Salir</span>
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
