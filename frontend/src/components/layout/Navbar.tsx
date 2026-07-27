import { Fragment, useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { Menu, X } from 'lucide-react'
import Logo from '../common/Logo'
import { homeFor, useAuth } from '../../store/auth'

interface Props {
  onLogin: () => void
}

const navItems = [
  { label: 'Inicio', to: '/' },
  { label: 'Inmobiliarias', to: '/inmobiliarias' },
  { label: 'Calculadoras', to: '/calculadoras' },
  { label: 'Tasaciones Online', to: '/tasaciones' },
  { label: 'Garantías de Alquiler', to: '/garantias' },
  { label: 'Seguros', to: '/seguros' },
]

// Header blanco con nav serif separada por barras verticales, según ui.pdf.
export default function Navbar({ onLogin }: Props) {
  const [open, setOpen] = useState(false)
  const user = useAuth((s) => s.user)

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-surface">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
        <Logo />

        {/* Nav desktop */}
        <nav className="hidden items-center lg:flex">
          {navItems.map((item, i) => (
            <Fragment key={item.label}>
              {i > 0 && <span className="mx-3 h-4 w-px bg-line" aria-hidden />}
              <NavLink
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  `font-serif text-[15px] transition-colors hover:text-accent-dark ${
                    isActive ? 'text-accent-dark' : 'text-ink'
                  }`
                }
              >
                {item.label}
              </NavLink>
            </Fragment>
          ))}
        </nav>

        <div className="hidden items-center gap-5 lg:flex">
          {user ? (
            <Link
              to={homeFor(user)}
              className="rounded bg-accent px-5 py-1.5 font-serif text-[15px] text-ink transition-colors hover:bg-accent-dark hover:text-white"
            >
              Mi panel
            </Link>
          ) : (
            <>
              <Link
                to="/registro"
                className="font-serif text-[15px] text-ink transition-colors hover:text-accent-dark"
              >
                Registrarse
              </Link>
              <button
                onClick={onLogin}
                className="rounded bg-accent px-5 py-1.5 font-serif text-[15px] text-ink transition-colors hover:bg-accent-dark hover:text-white"
              >
                Ingresar
              </button>
            </>
          )}
        </div>

        {/* Toggle mobile */}
        <button
          className="text-ink lg:hidden"
          onClick={() => setOpen((v) => !v)}
          aria-label="Menú"
        >
          {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {/* Menú mobile */}
      {open && (
        <nav className="border-t border-line bg-surface px-4 py-3 lg:hidden">
          {navItems.map((item) => (
            <NavLink
              key={item.label}
              to={item.to}
              end={item.to === '/'}
              onClick={() => setOpen(false)}
              className="block py-2 font-serif text-[15px] text-ink"
            >
              {item.label}
            </NavLink>
          ))}
          {user ? (
            <Link
              to={homeFor(user)}
              onClick={() => setOpen(false)}
              className="mt-2 block rounded bg-accent px-5 py-2 text-center font-serif text-[15px] text-ink"
            >
              Mi panel
            </Link>
          ) : (
            <>
              <Link
                to="/registro"
                onClick={() => setOpen(false)}
                className="block py-2 font-serif text-[15px] text-ink"
              >
                Registrarse
              </Link>
              <button
                onClick={() => {
                  setOpen(false)
                  onLogin()
                }}
                className="mt-2 w-full rounded bg-accent px-5 py-2 font-serif text-[15px] text-ink"
              >
                Ingresar
              </button>
            </>
          )}
        </nav>
      )}
    </header>
  )
}
