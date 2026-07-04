import { Link } from 'react-router-dom'
import { Building2, Eye, Inbox, TrendingUp } from 'lucide-react'
import StatCard from '../../components/panel/StatCard'
import Badge from '../../components/common/Badge'
import { leads, leadStatusLabels } from '../../data/panelMock'
import { properties, formatPrice } from '../../data/mock'

const toneByStatus = {
  new: 'accent',
  contacted: 'brand',
  closed: 'neutral',
} as const

export default function Dashboard() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-base text-ink">
          Dashboard
        </h1>
        <p className="text-muted">Resumen de tu inmobiliaria.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Building2} label="Propiedades activas" value="38" delta="+3 este mes" />
        <StatCard icon={Eye} label="Vistas (30 días)" value="12.4k" delta="+18%" tone="accent" />
        <StatCard icon={Inbox} label="Leads nuevos" value="2" delta="hoy" />
        <StatCard icon={TrendingUp} label="Conversión" value="6.2%" delta="+0.8%" tone="accent" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* Recent leads */}
        <div className="rounded-lg border border-line bg-surface p-5 shadow-card">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold tracking-base text-ink">
              Últimos leads
            </h2>
            <Link to="/panel/leads" className="text-sm font-medium text-brand hover:underline">
              Ver todos
            </Link>
          </div>
          <ul className="divide-y divide-line">
            {leads.slice(0, 4).map((l) => (
              <li key={l.id} className="flex items-center justify-between py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">{l.name}</p>
                  <p className="truncate text-xs text-muted">{l.property}</p>
                </div>
                <Badge tone={toneByStatus[l.status]}>
                  {leadStatusLabels[l.status]}
                </Badge>
              </li>
            ))}
          </ul>
        </div>

        {/* Recent properties */}
        <div className="rounded-lg border border-line bg-surface p-5 shadow-card">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold tracking-base text-ink">
              Tus propiedades
            </h2>
            <Link to="/panel/propiedades" className="text-sm font-medium text-brand hover:underline">
              Gestionar
            </Link>
          </div>
          <ul className="divide-y divide-line">
            {properties.slice(0, 4).map((p) => (
              <li key={p.id} className="flex items-center gap-3 py-3">
                <img src={p.image} alt="" className="h-12 w-16 rounded-md object-cover" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{p.title}</p>
                  <p className="text-xs text-muted">{p.city}</p>
                </div>
                <span className="text-sm font-bold text-ink">{formatPrice(p)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
