import { useState } from 'react'
import { Info, Loader2 } from 'lucide-react'
import Button from '../../components/common/Button'
import Badge from '../../components/common/Badge'
import { ErrorState, Spinner } from '../../components/common/AsyncState'
import { useResource } from '../../hooks/useResource'
import { cancelSubscription, getSubscription } from '../../api/subscription'
import type { SubscriptionStatus } from '../../api/schemas'
import { ApiError } from '../../lib/apiError'
import { formatARS } from '../../data/mock'

const statusLabels: Record<SubscriptionStatus, string> = {
  trialing: 'Período de prueba',
  active: 'Activa',
  past_due: 'Pago vencido',
  canceled: 'Cancelada',
  suspended: 'Suspendida',
}

const statusTone: Record<SubscriptionStatus, 'success' | 'brand' | 'warning' | 'danger'> = {
  trialing: 'brand',
  active: 'success',
  past_due: 'warning',
  canceled: 'danger',
  suspended: 'danger',
}

const intervalLabels = { monthly: 'mes', yearly: 'año' } as const

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('es-AR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })
}

interface UsageBarProps {
  label: string
  used: number
  limit: number
  unit?: string
}

function UsageBar({ label, used, limit, unit = '' }: UsageBarProps) {
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0
  return (
    <div>
      <div className="mb-1.5 flex justify-between text-sm">
        <span className="text-ink">{label}</span>
        <span className="text-muted tabular-nums">
          {used}
          {unit} / {limit}
          {unit}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-canvas">
        <div
          className={`h-full rounded-full ${pct > 85 ? 'bg-accent' : 'bg-brand'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

export default function Suscripcion() {
  const resource = useResource(() => getSubscription(), [])
  const [canceling, setCanceling] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const onCancel = async () => {
    setActionError(null)
    setCanceling(true)
    try {
      await cancelSubscription()
      resource.reload()
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'No se pudo cancelar')
    } finally {
      setCanceling(false)
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-base text-ink">Suscripción</h1>
        <p className="text-muted">Tu plan y el uso real contra sus límites.</p>
      </div>

      {resource.error ? (
        <ErrorState error={resource.error} onRetry={resource.reload} />
      ) : resource.loading && !resource.data ? (
        <Spinner label="Cargando tu suscripción…" />
      ) : resource.data ? (
        <>
          {actionError && (
            <p role="alert" className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {actionError}
            </p>
          )}

          <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
            <div className="rounded-lg border border-line bg-surface p-6 shadow-card">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold tracking-base text-ink">
                  Plan {resource.data.subscription.plan.name}
                </h2>
                <Badge tone={statusTone[resource.data.subscription.status]}>
                  {statusLabels[resource.data.subscription.status]}
                </Badge>
              </div>
              <p className="mt-2 text-2xl font-bold tracking-base text-ink">
                {formatARS(Number(resource.data.subscription.plan.priceAmount))}
                <span className="text-sm font-normal text-muted">
                  {' '}
                  / {intervalLabels[resource.data.subscription.plan.billingInterval]}
                </span>
              </p>
              <p className="mt-1 text-sm text-muted">
                {resource.data.subscription.cancelAtPeriodEnd
                  ? `Se da de baja el ${formatDate(resource.data.subscription.currentPeriodEnd)}`
                  : `Se renueva el ${formatDate(resource.data.subscription.currentPeriodEnd)}`}
              </p>

              <Button
                variant="secondary"
                className="mt-4 w-full"
                disabled={canceling || resource.data.subscription.cancelAtPeriodEnd}
                onClick={() => void onCancel()}
              >
                {canceling && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                {resource.data.subscription.cancelAtPeriodEnd
                  ? 'Baja programada'
                  : 'Cancelar al fin del período'}
              </Button>
            </div>

            <div className="rounded-lg border border-line bg-surface p-6 shadow-card">
              <h2 className="mb-4 text-lg font-semibold tracking-base text-ink">Uso del plan</h2>
              <div className="space-y-5">
                <UsageBar
                  label="Propiedades publicadas"
                  used={resource.data.usage.properties.used}
                  limit={resource.data.usage.properties.limit}
                />
                <UsageBar
                  label="Usuarios activos"
                  used={resource.data.usage.users.used}
                  limit={resource.data.usage.users.limit}
                />
                <UsageBar
                  label="Almacenamiento"
                  used={resource.data.usage.storageMb.used}
                  limit={resource.data.usage.storageMb.limit}
                  unit=" MB"
                />
              </div>
            </div>
          </div>

          {/* El cambio de plan self-serve depende del módulo de pagos, que
              todavía no existe en el backend (tareas 1.13 y 1.14). */}
          <div className="mt-8 flex items-start gap-3 rounded-lg border border-line bg-surface p-6 shadow-card">
            <Info className="mt-0.5 h-5 w-5 shrink-0 text-brand" aria-hidden />
            <div>
              <h2 className="font-semibold tracking-base text-ink">Cambiar de plan</h2>
              <p className="mt-1 text-sm text-muted">
                Por ahora el cambio de plan lo aplica el equipo de la plataforma.
                El alta de pagos online está en desarrollo.
              </p>
            </div>
          </div>
        </>
      ) : null}
    </div>
  )
}
