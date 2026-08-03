import { NavLink, Link } from 'react-router-dom'
import { Home, X, type LucideIcon } from 'lucide-react'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  end?: boolean
  /** Secciones que el backend reserva al tenant_admin. */
  adminOnly?: boolean
}

interface Props {
  open: boolean
  onClose: () => void
  brandHome: string
  title: string
  subtitle: string
  items: NavItem[]
}

export default function Sidebar({
  open,
  onClose,
  brandHome,
  title,
  subtitle,
  items,
}: Props) {
  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={onClose}
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-topbar text-white/80 transition-transform lg:static lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between px-5 py-4">
          {/* Mismo logo que el sitio público: el cliente pidió que quede igual
              en todas las secciones. */}
          <Link to={brandHome}>
            <img
              src="/brand/logo-blanco.png"
              alt="ER Entreriosprop"
              className="h-8 w-auto"
            />
          </Link>
          <button onClick={onClose} className="text-white/70 lg:hidden" aria-label="Cerrar">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-5 pb-2 pt-2">
          <p className="text-xs uppercase tracking-base text-white/40">{title}</p>
          <p className="truncate text-sm font-medium text-white/90">{subtitle}</p>
        </div>

        <nav className="flex-1 space-y-1 px-3 pt-2">
          {items.map((it) => (
            <NavLink
              key={it.label}
              to={it.to}
              end={it.end}
              onClick={onClose}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-white/10 text-white'
                    : 'text-white/70 hover:bg-white/5 hover:text-white'
                }`
              }
            >
              <it.icon className="h-4 w-4" />
              {it.label}
            </NavLink>
          ))}
        </nav>

        <Link
          to="/"
          className="m-3 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-white/70 transition-colors hover:bg-white/5 hover:text-white"
        >
          <Home className="h-4 w-4" />
          Ver sitio público
        </Link>
      </aside>
    </>
  )
}
