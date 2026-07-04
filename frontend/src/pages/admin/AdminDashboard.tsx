import { Link } from 'react-router-dom'
import { Building2, CircleDollarSign, CreditCard, TrendingUp } from 'lucide-react'
import StatCard from '../../components/panel/StatCard'
import Badge from '../../components/common/Badge'
import {
  revenueSeries,
  tenants,
  tenantStatusLabels,
  tenantStatusTone,
} from '../../data/adminMock'

export default function AdminDashboard() {
  const max = Math.max(...revenueSeries.map((r) => r.value))
  const active = tenants.filter((t) => t.status === 'active').length

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-base text-ink">
          Dashboard global
        </h1>
        <p className="text-muted">Estado de la plataforma.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Building2} label="Inmobiliarias" value={String(tenants.length)} delta={`${active} activas`} />
        <StatCard icon={CreditCard} label="Suscripciones activas" value={String(active)} delta="+1 este mes" tone="accent" />
        <StatCard icon={CircleDollarSign} label="MRR" value="$ 7.776.000" delta="+7%" />
        <StatCard icon={TrendingUp} label="Ingresos (6 meses)" value="$ 38.2M" delta="+12%" tone="accent" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        {/* Revenue chart */}
        <div className="rounded-lg border border-line bg-surface p-6 shadow-card">
          <h2 className="text-lg font-semibold tracking-base text-ink">
            Ingresos mensuales (ARS)
          </h2>
          <div className="mt-6 flex h-48 items-end gap-3">
            {revenueSeries.map((r) => (
              <div key={r.month} className="flex flex-1 flex-col items-center gap-2">
                <div
                  className="w-full rounded-t-md bg-brand transition-all hover:bg-brand-dark"
                  style={{ height: `${(r.value / max) * 100}%` }}
                  title={`$ ${r.value.toLocaleString('es-AR')}`}
                />
                <span className="text-xs text-muted">{r.month}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Recent tenants */}
        <div className="rounded-lg border border-line bg-surface p-6 shadow-card">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold tracking-base text-ink">
              Inmobiliarias recientes
            </h2>
            <Link to="/admin/inmobiliarias" className="text-sm font-medium text-brand hover:underline">
              Ver todas
            </Link>
          </div>
          <ul className="divide-y divide-line">
            {tenants.slice(0, 5).map((t) => (
              <li key={t.id} className="flex items-center justify-between py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">{t.name}</p>
                  <p className="text-xs text-muted">Plan {t.plan} · {t.properties} props</p>
                </div>
                <Badge tone={tenantStatusTone[t.status]}>
                  {tenantStatusLabels[t.status]}
                </Badge>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
