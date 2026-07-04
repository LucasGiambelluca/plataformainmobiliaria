import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Bell, Menu, UserCircle } from 'lucide-react'
import Sidebar, { type NavItem } from './Sidebar'

interface Props {
  brandHome: string
  title: string
  subtitle: string
  items: NavItem[]
  userName: string
  userRole: string
}

// Shared dashboard chrome (sidebar + top header) used by both the tenant panel
// and the Super Admin panel.
export default function DashShell({
  brandHome,
  title,
  subtitle,
  items,
  userName,
  userRole,
}: Props) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

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
                <p className="font-medium text-ink">{userName}</p>
                <p className="text-xs text-muted">{userRole}</p>
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
