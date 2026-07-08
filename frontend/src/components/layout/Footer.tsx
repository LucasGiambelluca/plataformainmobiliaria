import { Link } from 'react-router-dom'
import { Facebook, Instagram, Youtube } from 'lucide-react'
import Logo from '../common/Logo'
import { WhatsAppIcon } from '../common/BrandIcons'

// Footer blanco con logo, columnas de links y botones sociales, según ui.pdf.

const columns: { label: string; to: string }[][] = [
  [
    { label: 'Inicio', to: '/' },
    { label: 'Tasaciones Online', to: '/tasaciones' },
    { label: 'Términos y condiciones', to: '#' },
    { label: 'WhatsApp', to: '#' },
  ],
  [
    { label: 'Inmobiliarias', to: '/inmobiliarias' },
    { label: 'Garantías de alquiler', to: '/garantias' },
    { label: 'Política de privacidad', to: '#' },
    { label: 'E-Mail administración', to: '#' },
  ],
  [
    { label: 'Calculadoras', to: '/calculadoras' },
    { label: 'Política de cookies', to: '#' },
    { label: 'E-Mail comercial', to: '#' },
    { label: 'Cuenta cliente', to: '/registro' },
  ],
]

const socials = [
  { label: 'Facebook', href: '#', icon: <Facebook className="h-3.5 w-3.5" /> },
  { label: 'Instagram', href: '#', icon: <Instagram className="h-3.5 w-3.5" /> },
  { label: 'YouTube', href: '#', icon: <Youtube className="h-3.5 w-3.5" /> },
  { label: 'WhatsApp', href: '#', icon: <WhatsAppIcon className="h-3.5 w-3.5" /> },
]

export default function Footer() {
  return (
    <footer className="mt-16 border-t border-line bg-surface">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-10 md:grid-cols-[1.2fr_2fr_1fr]">
        <div>
          <Logo subtitle="es un producto de Hernández & asociados" />
          <p className="mt-6 text-[11px] tracking-wide text-muted">
            ©Copyright 2026 – Hernández & asociados – Todos los derechos
            reservados
          </p>
        </div>

        <div className="grid grid-cols-2 gap-x-8 gap-y-3 sm:grid-cols-3">
          {columns.map((col, i) => (
            <ul key={i} className="space-y-3">
              {col.map((l) => (
                <li key={l.label}>
                  <Link
                    to={l.to}
                    className="font-serif text-sm text-ink transition-colors hover:text-accent-dark"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          ))}
        </div>

        <div className="space-y-3">
          {socials.map((s) => (
            <a
              key={s.label}
              href={s.href}
              className="flex items-center gap-3 border border-ink px-2 py-1 transition-colors hover:bg-canvas"
            >
              <span className="grid h-6 w-6 place-items-center bg-ink text-white">
                {s.icon}
              </span>
              <span className="font-serif text-sm text-ink">{s.label}</span>
            </a>
          ))}
        </div>
      </div>
    </footer>
  )
}
