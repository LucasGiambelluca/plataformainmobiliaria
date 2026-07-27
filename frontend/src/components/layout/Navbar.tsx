import { Fragment, useEffect, useRef, useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { ChevronDown, Menu, X } from 'lucide-react'
import Logo from '../common/Logo'
import { useResource } from '../../hooks/useResource'
import { getAgencies } from '../../api/publicCatalog'
import { homeFor, useAuth } from '../../store/auth'

interface Props {
  onLogin: () => void
}

const navItems = [
  { label: 'Inicio', to: '/' },
  { label: 'Calculadoras', to: '/calculadoras' },
  { label: 'Tasaciones Online', to: '/tasaciones' },
  { label: 'Garantías de Alquiler', to: '/garantias' },
  { label: 'Seguros', to: '/seguros' },
]

const linkBase =
  'font-serif text-[15px] transition-colors hover:text-accent-dark'

/** Desplegable de Inmobiliarias: lista las agencias activas del portal. */
function AgenciesMenu() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const agencias = useResource(() => getAgencies(), [])

  // Cierra al hacer click afuera o con Escape. Sin lo segundo, quien navega con
  // teclado queda atrapado con el menú abierto.
  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const items = agencias.data ?? []

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="true"
        className={`flex items-center gap-1 text-ink ${linkBase}`}
      >
        Inmobiliarias
        <ChevronDown
          className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-40 mt-2 w-72 overflow-hidden rounded-md border border-line bg-surface shadow-card-hover">
          <Link
            to="/inmobiliarias"
            onClick={() => setOpen(false)}
            className="block border-b border-line px-4 py-2.5 font-serif text-sm font-semibold text-brand hover:bg-canvas"
          >
            Ver todas las inmobiliarias
          </Link>

          {agencias.loading ? (
            <p className="px-4 py-3 text-sm text-muted">Cargando…</p>
          ) : items.length === 0 ? (
            <p className="px-4 py-3 text-sm text-muted">
              Todavía no hay inmobiliarias publicando.
            </p>
          ) : (
            <ul className="max-h-80 overflow-y-auto py-1">
              {items.map((a) => (
                <li key={a.id}>
                  <Link
                    to={`/buscar?agency=${a.slug}`}
                    onClick={() => setOpen(false)}
                    className="flex items-center justify-between gap-3 px-4 py-2 text-sm text-ink hover:bg-canvas"
                  >
                    <span className="truncate">{a.name}</span>
                    <span className="shrink-0 text-xs text-muted">
                      {a.propertiesCount}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

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
          {navItems.slice(0, 1).map((item) => (
            <NavLink
              key={item.label}
              to={item.to}
              end
              className={({ isActive }) =>
                `${linkBase} ${isActive ? 'text-accent-dark' : 'text-ink'}`
              }
            >
              {item.label}
            </NavLink>
          ))}

          <span className="mx-3 h-4 w-px bg-line" aria-hidden />
          <AgenciesMenu />

          {navItems.slice(1).map((item) => (
            <Fragment key={item.label}>
              <span className="mx-3 h-4 w-px bg-line" aria-hidden />
              <NavLink
                to={item.to}
                className={({ isActive }) =>
                  `${linkBase} ${isActive ? 'text-accent-dark' : 'text-ink'}`
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
              <Link to="/registro" className={`text-ink ${linkBase}`}>
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
          <NavLink to="/" end onClick={() => setOpen(false)} className="block py-2 font-serif text-[15px] text-ink">
            Inicio
          </NavLink>
          <NavLink
            to="/inmobiliarias"
            onClick={() => setOpen(false)}
            className="block py-2 font-serif text-[15px] text-ink"
          >
            Inmobiliarias
          </NavLink>
          {navItems.slice(1).map((item) => (
            <NavLink
              key={item.label}
              to={item.to}
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
