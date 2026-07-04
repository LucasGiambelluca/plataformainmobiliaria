import { Link } from 'react-router-dom'
import { Search } from 'lucide-react'

// Promo / announcement bar — equivalent to the reference's top strip but in the
// new brand palette (teal-900 instead of maroon).
export default function TopBar() {
  return (
    <div className="bg-topbar text-white">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-3 px-4 py-2.5 text-sm">
        <span className="flex items-center gap-2 font-medium">
          <Search className="h-4 w-4 text-brand-light" />
          ¡Buscamos por vos! Tu búsqueda llega a todas las inmobiliarias.
        </span>
        <Link
          to="/publicar"
          className="rounded-pill border border-white/40 px-4 py-1 text-xs font-medium transition-colors hover:bg-white/10"
        >
          Quiero probarlo
        </Link>
      </div>
    </div>
  )
}
