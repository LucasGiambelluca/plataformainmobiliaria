import { Link } from 'react-router-dom'
import { Building2, Eye, Inbox, MessageSquare } from 'lucide-react'
import StatCard from '../../components/panel/StatCard'
import Badge from '../../components/common/Badge'
import { EmptyState, ErrorState, Spinner } from '../../components/common/AsyncState'
import { useResource } from '../../hooks/useResource'
import { getTenantMetrics } from '../../api/metrics'
import { listInquiries } from '../../api/inquiries'
import type { InquiryStatus } from '../../api/schemas'

const statusLabels: Record<InquiryStatus, string> = {
  new: 'Nuevo',
  contacted: 'Contactado',
  closed: 'Cerrado',
}

const statusTone: Record<InquiryStatus, 'accent' | 'brand' | 'neutral'> = {
  new: 'accent',
  contacted: 'brand',
  closed: 'neutral',
}

export default function Dashboard() {
  const metrics = useResource(getTenantMetrics)
  const leads = useResource(() => listInquiries({ pageSize: 4 }))

  if (metrics.error) {
    return <ErrorState error={metrics.error} onRetry={metrics.reload} />
  }
  if (!metrics.data) {
    return <Spinner label="Cargando métricas…" />
  }

  const m = metrics.data
  const publicadas = m.properties.published + m.properties.featured

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-base text-ink">Dashboard</h1>
        <p className="text-muted">Resumen de tu inmobiliaria.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={Building2}
          label="Propiedades publicadas"
          value={String(publicadas)}
          delta={
            m.properties.draft > 0
              ? `${m.properties.draft} en borrador`
              : `${m.properties.total} en total`
          }
        />
        <StatCard
          icon={Eye}
          label="Vistas totales"
          value={m.viewsTotal.toLocaleString('es-AR')}
          tone="accent"
        />
        <StatCard
          icon={Inbox}
          label="Leads sin responder"
          value={String(m.inquiries.new)}
          delta={`${m.inquiries.total} en total`}
        />
        <StatCard
          icon={MessageSquare}
          label="Consultas (30 días)"
          value={String(m.inquiries.last30Days)}
          tone="accent"
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-line bg-surface p-5 shadow-card">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold tracking-base text-ink">
              Últimos leads
            </h2>
            <Link
              to="/panel/leads"
              className="text-sm font-medium text-brand hover:underline"
            >
              Ver todos
            </Link>
          </div>
          {leads.error ? (
            <ErrorState error={leads.error} onRetry={leads.reload} />
          ) : !leads.data ? (
            <Spinner label="Cargando consultas…" />
          ) : leads.data.items.length === 0 ? (
            <EmptyState>Todavía no recibiste consultas.</EmptyState>
          ) : (
            <ul className="divide-y divide-line">
              {leads.data.items.map((l) => (
                <li key={l.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink">{l.name}</p>
                    <p className="truncate text-xs text-muted">
                      {l.propertyTitle ?? 'Consulta general'}
                    </p>
                  </div>
                  <Badge tone={statusTone[l.status]}>{statusLabels[l.status]}</Badge>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-lg border border-line bg-surface p-5 shadow-card">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold tracking-base text-ink">
              Más vistas
            </h2>
            <Link
              to="/panel/propiedades"
              className="text-sm font-medium text-brand hover:underline"
            >
              Gestionar
            </Link>
          </div>
          {m.topProperties.length === 0 ? (
            <EmptyState>Todavía no cargaste propiedades.</EmptyState>
          ) : (
            <ul className="divide-y divide-line">
              {m.topProperties.map((p) => (
                <li key={p.id} className="flex items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">{p.title}</p>
                  </div>
                  <span className="flex shrink-0 items-center gap-1.5 text-sm text-muted">
                    <Eye className="h-3.5 w-3.5" aria-hidden />
                    {p.viewsCount.toLocaleString('es-AR')}
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
