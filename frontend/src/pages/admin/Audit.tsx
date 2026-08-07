import { useState } from 'react'
import Button from '../../components/common/Button'
import Select from '../../components/common/Select'
import Badge from '../../components/common/Badge'
import { EmptyState, ErrorState, Spinner } from '../../components/common/AsyncState'
import { useResource } from '../../hooks/useResource'
import { getAuditActions, getAuditLog } from '../../api/metrics'

const PAGE_SIZE = 25

/** Nombres legibles para las acciones que registra el backend. */
const actionLabels: Record<string, string> = {
  'tenant.create': 'Alta de inmobiliaria',
  'tenant.update': 'Edición de inmobiliaria',
  'tenant.suspend': 'Suspensión',
  'tenant.activate': 'Reactivación',
  'plan.create': 'Alta de plan',
  'plan.update': 'Edición de plan',
  'user.create': 'Alta de usuario',
  'user.deactivate': 'Baja de usuario',
  'property.delete': 'Baja de propiedad',
  'subscription.cancel': 'Cancelación de suscripción',
  'payment.received': 'Pago acreditado',
  'payment.failed': 'Pago rechazado',
  'site.publish': 'Publicación del sitio',
  'site.unpublish': 'Sitio despublicado',
  'domain.create': 'Alta de dominio',
  'domain.verify': 'Verificación de dominio',
  'domain.delete': 'Baja de dominio',
  'impersonation.start': 'Acceso de soporte al panel',
}

const etiqueta = (action: string) => actionLabels[action] ?? action

const actionTone = (action: string) => {
  if (action.includes('delete') || action.includes('suspend')) return 'danger'
  if (action.includes('failed') || action.includes('cancel')) return 'warning'
  if (action.includes('create') || action.includes('received')) return 'success'
  return 'neutral'
}

function formatFecha(iso: string): string {
  return new Date(iso).toLocaleString('es-AR', {
    day: '2-digit',
    month: 'short',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Resume la entidad tocada sin volcar el uuid entero. */
function entidad(tipo: string | null, id: string | null): string {
  if (!tipo && !id) return '—'
  const corto = id ? id.slice(0, 8) : ''
  return [tipo, corto].filter(Boolean).join(' · ')
}

export default function Audit() {
  const [action, setAction] = useState('all')
  const [page, setPage] = useState(1)

  // El desplegable se llena con la lista cerrada del backend, no con lo que
  // haya en la tabla: así las acciones sin registros también se pueden filtrar.
  const actions = useResource(getAuditActions)
  const log = useResource(
    () =>
      getAuditLog({
        action: action === 'all' ? undefined : action,
        page,
        pageSize: PAGE_SIZE,
      }),
    [action, page],
  )

  const actionOptions = [
    { value: 'all', label: 'Todas las acciones' },
    ...(actions.data ?? []).map((a) => ({ value: a, label: etiqueta(a) })),
  ]

  const total = log.data?.total ?? 0
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-base text-ink">Auditoría</h1>
        <p className="text-muted">
          {log.loading && !log.data
            ? 'Cargando…'
            : `${total} ${total === 1 ? 'registro' : 'registros'} en la plataforma.`}
        </p>
      </div>

      <div className="mb-4 w-full sm:w-64">
        <Select
          options={actionOptions}
          value={action}
          onChange={(e) => {
            setAction(e.target.value)
            setPage(1)
          }}
        />
      </div>

      {log.error ? (
        <ErrorState error={log.error} onRetry={log.reload} />
      ) : log.loading && !log.data ? (
        <Spinner label="Cargando registros…" />
      ) : log.data && log.data.items.length === 0 ? (
        <EmptyState>
          {action === 'all'
            ? 'Todavía no hay acciones registradas.'
            : 'Ninguna acción de ese tipo quedó registrada.'}
        </EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line bg-surface shadow-card">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line bg-canvas text-xs uppercase tracking-base text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Fecha</th>
                <th className="px-4 py-3 font-medium">Usuario</th>
                <th className="hidden px-4 py-3 font-medium md:table-cell">
                  Inmobiliaria
                </th>
                <th className="px-4 py-3 font-medium">Acción</th>
                <th className="px-4 py-3 font-medium">Entidad</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {log.data?.items.map((l) => (
                <tr key={l.id} className="hover:bg-canvas/60">
                  <td className="whitespace-nowrap px-4 py-3 text-muted">
                    {formatFecha(l.createdAt)}
                  </td>
                  <td className="px-4 py-3 font-medium text-ink">
                    {l.userEmail ?? 'Sistema'}
                  </td>
                  <td className="hidden px-4 py-3 text-muted md:table-cell">
                    {l.tenantName ?? '—'}
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={actionTone(l.action)}>{etiqueta(l.action)}</Badge>
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {entidad(l.entityType, l.entityId)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm text-muted">
          <span>
            Página {page} de {pages}
          </span>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              disabled={page <= 1 || log.loading}
              onClick={() => setPage((p) => p - 1)}
            >
              Anterior
            </Button>
            <Button
              variant="secondary"
              disabled={page >= pages || log.loading}
              onClick={() => setPage((p) => p + 1)}
            >
              Siguiente
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
