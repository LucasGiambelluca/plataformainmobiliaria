import { Fragment, useState, type ReactNode } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { Facebook, Instagram, Menu, X, Youtube } from 'lucide-react'
import Logo from '../common/Logo'
import Chevron from '../common/Chevron'
import { useResource } from '../../hooks/useResource'
import { usePopover } from '../../hooks/usePopover'
import { getAgencies } from '../../api/publicCatalog'
import { getDolarOficial } from '../../api/dolar'
import { homeFor, useAuth } from '../../store/auth'

interface Props {
  onLogin: () => void
}

// Header según M2Prop.pdf. Las medidas son las del PDF (frame de 1440px): texto
// del nav en 10px, separadores de 1,4×7px y 10px de aire a cada lado,
// botón Ingresar de 83×24. Si algo se ve "chico", es el diseño: no redondear.

const linkBase = 'font-serif text-[10px] leading-none text-black transition-colors hover:text-accent'

const socials = [
  { label: 'Facebook', href: '#', icon: Facebook },
  { label: 'Instagram', href: '#', icon: Instagram },
  { label: 'YouTube', href: '#', icon: Youtube },
]

/** Barra vertical negra entre ítems del nav. */
function Sep() {
  return <span className="h-[7px] w-px shrink-0 bg-black" aria-hidden />
}

function Dropdown({ label, children }: { label: string; children: (close: () => void) => ReactNode }) {
  const { open, setOpen, ref } = usePopover()
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="true"
        className={`flex items-center gap-[7.5px] pr-[2px] ${linkBase}`}
      >
        {label}
        <Chevron className="h-[2.8px] w-[4.6px]" open={open} />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-40 mt-3 w-72 overflow-hidden rounded-md border border-line bg-surface shadow-card-hover">
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  )
}

/** Desplegable de Inmobiliarias: lista las agencias activas del portal. */
function AgenciesMenu() {
  const agencias = useResource(() => getAgencies(), [])
  const items = agencias.data ?? []

  return (
    <Dropdown label="Inmobiliarias">
      {(close) => (
        <>
          <Link
            to="/inmobiliarias"
            onClick={close}
            className="block border-b border-line px-4 py-2.5 font-serif text-sm font-semibold text-accent hover:bg-cream"
          >
            Ver todas las inmobiliarias
          </Link>
          {agencias.loading ? (
            <p className="px-4 py-3 text-sm text-muted">Cargando…</p>
          ) : items.length === 0 ? (
            <p className="px-4 py-3 text-sm text-muted">Todavía no hay inmobiliarias publicando.</p>
          ) : (
            <ul className="max-h-80 overflow-y-auto py-1">
              {items.map((a) => (
                <li key={a.id}>
                  <Link
                    to={`/buscar?agency=${a.slug}`}
                    onClick={close}
                    className="flex items-center justify-between gap-3 px-4 py-2 text-sm text-ink hover:bg-cream"
                  >
                    <span className="truncate">{a.name}</span>
                    <span className="shrink-0 text-xs text-muted">{a.propertiesCount}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Dropdown>
  )
}

/**
 * Créditos Hipotecarios está en el diseño como desplegable, pero todavía no
 * hay contenido detrás. Se muestra igual para respetar el header y avisa en vez
 * de llevar a una página vacía.
 */
function CreditosMenu() {
  return (
    <Dropdown label="Créditos Hipotecarios">
      {() => (
        <p className="px-4 py-3 font-serif text-sm text-muted">
          Próximamente: simuladores y líneas de crédito hipotecario.
        </p>
      )}
    </Dropdown>
  )
}

const simpleLinks = [
  { label: 'Calculadora', to: '/calculadoras' },
  { label: 'Tasaciones', to: '/tasaciones' },
]
const trailingLinks = [
  { label: 'Garantías para Alquilar', to: '/garantias' },
  { label: 'Seguros y Caución', to: '/seguros' },
]

// Sin color de "activo": el diseño muestra el nav siempre en negro.
const navClass = () => linkBase

/** "$1400": el diseño muestra el entero sin separador de miles. */
function precio(n: number | undefined) {
  return n === undefined ? '—' : `$${Math.round(n)}`
}

export default function Navbar({ onLogin }: Props) {
  const [open, setOpen] = useState(false)
  const user = useAuth((s) => s.user)
  // Si dolarapi no contesta, la cotización simplemente no se muestra: no es
  // motivo para ensuciar el header con un error.
  const dolar = useResource(() => getDolarOficial(), [])

  return (
    <header className="sticky top-0 z-30 bg-cream">
      <div className="mx-auto flex h-[51px] max-w-[1440px] items-center justify-between gap-4 px-4 min-[1140px]:justify-start min-[1140px]:gap-0 min-[1140px]:pl-[33.5px] min-[1140px]:pr-[25px]">
        {/* 2,3px más abajo que el centro: así está en el PDF. */}
        <Logo className="translate-y-[2.3px]" />

        {/* Nav desktop */}
        <nav className="ml-[40.8px] hidden items-center gap-[10px] min-[1140px]:flex">
          <NavLink to="/" end className={navClass}>
            Inicio
          </NavLink>
          <Sep />
          <AgenciesMenu />
          {simpleLinks.map((l) => (
            <Fragment key={l.to}>
              <Sep />
              <NavLink to={l.to} className={navClass}>
                {l.label}
              </NavLink>
            </Fragment>
          ))}
          <Sep />
          <CreditosMenu />
          {trailingLinks.map((l) => (
            <Fragment key={l.to}>
              <Sep />
              <NavLink to={l.to} className={navClass}>
                {l.label}
              </NavLink>
            </Fragment>
          ))}
          <Sep />
          <div className="flex items-center gap-[9px]">
            {socials.map(({ label, href, icon: Icon }) => (
              <a
                key={label}
                href={href}
                aria-label={label}
                className="grid h-5 w-5 place-items-center rounded-[4px] border-[0.8px] border-black text-black transition-colors hover:border-accent hover:text-accent"
              >
                <Icon className="h-[11px] w-[11px]" strokeWidth={1.6} />
              </a>
            ))}
          </div>
          <Sep />
        </nav>

        <div className="hidden items-center min-[1140px]:flex">
          {user ? (
            <Link
              to={homeFor(user)}
              className="ml-[16.5px] grid h-6 min-w-[83px] place-items-center rounded-full bg-accent px-4 font-serif text-[11px] text-white transition-colors hover:bg-accent-dark"
            >
              Mi panel
            </Link>
          ) : (
            <>
              <Link
                to="/registro"
                className="ml-[16.5px] font-serif text-[11px] text-black transition-colors hover:text-accent"
              >
                Registrarse
              </Link>
              <button
                onClick={onLogin}
                className="ml-[17px] grid h-6 w-[83px] place-items-center rounded-full bg-accent font-serif text-[11px] text-white transition-colors hover:bg-accent-dark"
              >
                Ingresar
              </button>
            </>
          )}

          {!dolar.error && (
            <div className="hidden items-center font-serif text-[10px] text-black min-[1380px]:flex">
              <span className="ml-[25px]">Dólar Compra {precio(dolar.data?.compra)}</span>
              <span className="ml-[23px]">Dólar Venta {precio(dolar.data?.venta)}</span>
            </div>
          )}
        </div>

        {/* Toggle mobile */}
        <button
          className="text-black min-[1140px]:hidden"
          onClick={() => setOpen((v) => !v)}
          aria-label="Menú"
        >
          {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {/* Menú mobile */}
      {open && (
        <nav className="border-t border-black/10 bg-cream px-4 py-3 min-[1140px]:hidden">
          {[
            { label: 'Inicio', to: '/' },
            { label: 'Inmobiliarias', to: '/inmobiliarias' },
            ...simpleLinks,
            ...trailingLinks,
          ].map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              onClick={() => setOpen(false)}
              className="block py-2 font-serif text-[15px] text-black"
            >
              {item.label}
            </NavLink>
          ))}

          <div className="mt-2 flex items-center gap-3">
            {socials.map(({ label, href, icon: Icon }) => (
              <a
                key={label}
                href={href}
                aria-label={label}
                className="grid h-8 w-8 place-items-center rounded-md border border-black text-black"
              >
                <Icon className="h-4 w-4" strokeWidth={1.6} />
              </a>
            ))}
          </div>

          {dolar.data && (
            <p className="mt-3 font-serif text-sm text-black">
              Dólar Compra {precio(dolar.data.compra)} · Dólar Venta {precio(dolar.data.venta)}
            </p>
          )}

          {user ? (
            <Link
              to={homeFor(user)}
              onClick={() => setOpen(false)}
              className="mt-3 block rounded-full bg-accent px-5 py-2 text-center font-serif text-[15px] text-white"
            >
              Mi panel
            </Link>
          ) : (
            <>
              <Link
                to="/registro"
                onClick={() => setOpen(false)}
                className="block py-2 font-serif text-[15px] text-black"
              >
                Registrarse
              </Link>
              <button
                onClick={() => {
                  setOpen(false)
                  onLogin()
                }}
                className="mt-2 w-full rounded-full bg-accent px-5 py-2 font-serif text-[15px] text-white"
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
