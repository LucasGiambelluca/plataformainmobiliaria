import { useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { ChevronDown, LogIn, Menu, X } from 'lucide-react'
import Button from '../common/Button'

interface Props {
  onLogin: () => void
}

const navItems = [
  { label: 'Venta', to: '/buscar?op=venta' },
  { label: 'Alquiler', to: '/buscar?op=alquiler' },
  { label: 'Temporal', to: '/buscar?op=temporal' },
  { label: 'Inmobiliarias', to: '/inmobiliarias' },
]

export default function Navbar({ onLogin }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-surface">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
        <Link to="/" className="flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand text-sm font-bold text-white">
            iH
          </span>
          <span className="text-xl font-bold tracking-base text-ink">
            Inmo<span className="text-brand">Hub</span>
          </span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-7 md:flex">
          {navItems.map((item) => (
            <NavLink
              key={item.label}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-1 text-sm font-medium tracking-base transition-colors hover:text-brand ${
                  isActive ? 'text-brand' : 'text-ink'
                }`
              }
            >
              {item.label}
              {['Venta', 'Alquiler', 'Temporal'].includes(item.label) && (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
            </NavLink>
          ))}
        </nav>

        <div className="hidden items-center gap-4 md:flex">
          <Link
            to="/publicar"
            className="text-sm font-medium text-ink transition-colors hover:text-brand"
          >
            Publicar
          </Link>
          <Button variant="accent" onClick={onLogin}>
            <LogIn className="h-4 w-4" />
            Iniciar sesión
          </Button>
        </div>

        {/* Mobile toggle */}
        <button
          className="text-ink md:hidden"
          onClick={() => setOpen((v) => !v)}
          aria-label="Menú"
        >
          {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {/* Mobile menu */}
      {open && (
        <nav className="border-t border-line bg-surface px-4 py-3 md:hidden">
          {navItems.map((item) => (
            <NavLink
              key={item.label}
              to={item.to}
              onClick={() => setOpen(false)}
              className="block py-2 text-sm font-medium text-ink"
            >
              {item.label}
            </NavLink>
          ))}
          <Link
            to="/publicar"
            onClick={() => setOpen(false)}
            className="block py-2 text-sm font-medium text-ink"
          >
            Publicar
          </Link>
          <Button
            variant="accent"
            className="mt-2 w-full"
            onClick={() => {
              setOpen(false)
              onLogin()
            }}
          >
            <LogIn className="h-4 w-4" />
            Iniciar sesión
          </Button>
        </nav>
      )}
    </header>
  )
}
