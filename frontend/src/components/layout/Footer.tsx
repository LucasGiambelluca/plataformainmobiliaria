import { Link } from 'react-router-dom'
import { Facebook, Instagram, Mail } from 'lucide-react'

export default function Footer() {
  return (
    <footer className="mt-16 bg-topbar text-white/80">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-12 md:grid-cols-4">
        <div>
          <span className="text-xl font-bold text-white">
            Inmo<span className="text-brand-light">Hub</span>
          </span>
          <p className="mt-3 text-sm leading-relaxed">
            El portal que conecta tu búsqueda con todas las inmobiliarias de la
            red.
          </p>
        </div>

        <div>
          <h4 className="mb-3 text-sm font-semibold text-white">Operaciones</h4>
          <ul className="space-y-2 text-sm">
            <li><Link to="/buscar?op=venta" className="hover:text-white">Venta</Link></li>
            <li><Link to="/buscar?op=alquiler" className="hover:text-white">Alquiler</Link></li>
            <li><Link to="/buscar?op=temporal" className="hover:text-white">Temporal</Link></li>
          </ul>
        </div>

        <div>
          <h4 className="mb-3 text-sm font-semibold text-white">Plataforma</h4>
          <ul className="space-y-2 text-sm">
            <li><Link to="/inmobiliarias" className="hover:text-white">Inmobiliarias</Link></li>
            <li><Link to="/publicar" className="hover:text-white">Publicar</Link></li>
            <li><Link to="/registro" className="hover:text-white">Registrarse</Link></li>
          </ul>
        </div>

        <div>
          <h4 className="mb-3 text-sm font-semibold text-white">Seguinos</h4>
          <div className="flex gap-3">
            <a href="#" className="grid h-9 w-9 place-items-center rounded-full bg-white/10 hover:bg-white/20" aria-label="Facebook"><Facebook className="h-4 w-4" /></a>
            <a href="#" className="grid h-9 w-9 place-items-center rounded-full bg-white/10 hover:bg-white/20" aria-label="Instagram"><Instagram className="h-4 w-4" /></a>
            <a href="#" className="grid h-9 w-9 place-items-center rounded-full bg-white/10 hover:bg-white/20" aria-label="Email"><Mail className="h-4 w-4" /></a>
          </div>
        </div>
      </div>

      <div className="border-t border-white/10 py-4 text-center text-xs text-white/60">
        © 2026 InmoHub — Plataforma inmobiliaria multitenant.
      </div>
    </footer>
  )
}
