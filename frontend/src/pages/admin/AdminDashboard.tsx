import { Link } from 'react-router-dom'
import {
  Building2,
  CircleDollarSign,
  CreditCard,
  Inbox,
  TrendingUp,
} from 'lucide-react'
import StatCard from '../../components/panel/StatCard'
import { EmptyState, ErrorState, Spinner } from '../../components/common/AsyncState'
import { useResource } from '../../hooks/useResource'
import { getPlatformMetrics } from '../../api/metrics'
import { formatARS } from '../../lib/format'

/** Montos grandes: en las tarjetas se muestran abreviados para que entren. */
function compacto(monto: string): string {
  const n = Number(monto)
  if (n >= 1_000_000) return `$ ${(n / 1_000_000).toFixed(1)}M`
  return formatARS(n)
}

export default function AdminDashboard() {
  const resource = useResource(getPlatformMetrics)

  if (resource.error) {
    return <ErrorState error={resource.error} onRetry={resource.reload} />
  }
  if (!resource.data) {
    return <Spinner label="Cargando métricas…" />
  }

  const m = resource.data
  // La escala del gráfico se calcula sobre el máximo real; con todo en cero no
  // se puede dividir, así que se usa 1 y las barras quedan al ras.
  const max = Math.max(1, ...m.revenueSeries.map((r) => Number(r.amount)))
  const conIngresos = m.revenueSeries.some((r) => Number(r.amount) > 0)

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-base text-ink">
          Dashboard global
        </h1>
        <p className="text-muted">Estado de la plataforma.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={Building2}
          label="Inmobiliarias"
          value={String(m.tenants.total)}
          delta={`${m.tenants.active} activas`}
        />
        <StatCard
          icon={CreditCard}
          label="Suscripciones activas"
          value={String(m.subscriptions.active)}
          delta={
            m.subscriptions.pastDue > 0
              ? `${m.subscriptions.pastDue} con pago pendiente`
              : undefined
          }
          tone="accent"
        />
        <StatCard icon={CircleDollarSign} label="MRR" value={compacto(m.mrr)} />
        <StatCard
          icon={TrendingUp}
          label="Ingresos (6 meses)"
          value={compacto(m.revenueLast6Months)}
          tone="accent"
        />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={Building2}
          label="Propiedades publicadas"
          value={String(m.properties.published)}
          delta={`${m.properties.total} en total`}
        />
        <StatCard
          icon={Inbox}
          label="Consultas (30 días)"
          value={String(m.inquiriesLast30Days)}
          tone="accent"
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="rounded-lg border border-line bg-surface p-6 shadow-card">
          <h2 className="text-lg font-semibold tracking-base text-ink">
            Ingresos mensuales (ARS)
          </h2>
          {conIngresos ? (
            <div className="mt-6 flex h-48 items-end gap-3">
              {m.revenueSeries.map((r) => (
                <div key={r.month} className="flex flex-1 flex-col items-center gap-2">
                  <div
                    className="w-full rounded-t-md bg-brand transition-all hover:bg-brand-dark"
                    style={{ height: `${(Number(r.amount) / max) * 100}%` }}
                    title={formatARS(Number(r.amount))}
                  />
                  <span className="text-xs text-muted">{r.month}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="py-12 text-center text-sm text-muted">
              Todavía no se registraron pagos aprobados.
            </p>
          )}
        </div>

        <div className="rounded-lg border border-line bg-surface p-6 shadow-card">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold tracking-base text-ink">
              Con más publicaciones
            </h2>
            <Link
              to="/admin/inmobiliarias"
              className="text-sm font-medium text-brand hover:underline"
            >
              Ver todas
            </Link>
          </div>
          {m.topAgencies.length === 0 ? (
            <EmptyState>Todavía no hay inmobiliarias activas.</EmptyState>
          ) : (
            <ul className="divide-y divide-line">
              {m.topAgencies.map((t) => (
                <li key={t.id} className="flex items-center justify-between py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink">{t.name}</p>
                    <p className="truncate text-xs text-muted">/{t.slug}</p>
                  </div>
                  <span className="shrink-0 text-sm text-muted">
                    {t.properties} {t.properties === 1 ? 'prop' : 'props'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
