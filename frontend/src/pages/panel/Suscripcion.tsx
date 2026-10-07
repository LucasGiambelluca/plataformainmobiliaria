import { useState } from 'react'
import { Check, Info, Loader2 } from 'lucide-react'
import Button from '../../components/common/Button'
import Badge from '../../components/common/Badge'
import { ErrorState, Spinner } from '../../components/common/AsyncState'
import { useResource } from '../../hooks/useResource'
import { cancelSubscription, getSubscription } from '../../api/subscription'
import { getPlans, startCheckout } from '../../api/billing'
import type { SubscriptionStatus } from '../../api/schemas'
import { ApiError } from '../../lib/apiError'
import { formatARS } from '../../lib/format'

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
  const planes = useResource(() => getPlans(), [])
  const [canceling, setCanceling] = useState(false)
  const [contratando, setContratando] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const contratar = async (planId: string) => {
    setActionError(null)
    setContratando(planId)
    try {
      // La pasarela se encarga del cobro; volvemos acá cuando termine.
      window.location.href = await startCheckout(planId)
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'No se pudo iniciar el pago')
      setContratando(null)
    }
  }

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

          {!resource.data.subscription.alDia && (
            <p role="alert" className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              Tu suscripción venció sin que se acredite el pago: tenés los límites del plan
              gratuito hasta que se regularice. Lo que ya publicaste sigue visible. Para
              reactivar el plan, volvé a contratarlo abajo.
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
                <UsageBar
                  label="Dominios propios"
                  used={resource.data.usage.domains.used}
                  limit={resource.data.usage.domains.limit}
                />
                <UsageBar
                  label="Propiedades destacadas"
                  used={resource.data.usage.featured.used}
                  limit={resource.data.usage.featured.limit}
                />
              </div>
            </div>
          </div>

          <h2 className="mb-4 mt-8 text-lg font-semibold tracking-base text-ink">
            Planes disponibles
          </h2>

          {planes.error ? (
            <ErrorState error={planes.error} onRetry={planes.reload} />
          ) : planes.loading && !planes.data ? (
            <Spinner />
          ) : (
            <div className="grid gap-6 md:grid-cols-3">
              {planes.data?.map((plan) => {
                const actual = plan.id === resource.data?.subscription.plan.id
                const gratuito = Number(plan.priceAmount) === 0
                // El plan actual se vuelve a contratar si el débito se cayó: es
                // la única forma de reautorizarlo después de un rechazo o una baja.
                const reactivable =
                  actual &&
                  !gratuito &&
                  (!resource.data?.subscription.alDia ||
                    resource.data?.subscription.status !== 'active')
                return (
                  <div
                    key={plan.id}
                    className={`rounded-xl border bg-surface p-6 shadow-card ${
                      actual ? 'border-brand ring-1 ring-brand' : 'border-line'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-bold tracking-base text-ink">
                        {plan.name}
                      </h3>
                      {actual && <Badge tone="brand">Actual</Badge>}
                    </div>
                    <p className="mt-2 text-2xl font-bold tracking-base text-ink">
                      {gratuito ? 'Gratis' : formatARS(Number(plan.priceAmount))}
                      {!gratuito && (
                        <span className="text-sm font-normal text-muted">
                          {' '}
                          / {intervalLabels[plan.billingInterval as 'monthly']}
                        </span>
                      )}
                    </p>
                    <ul className="mt-4 space-y-2 text-sm text-ink">
                      <li className="flex items-center gap-2">
                        <Check className="h-4 w-4 text-brand" />
                        {plan.maxProperties} propiedades
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="h-4 w-4 text-brand" />
                        {plan.maxUsers} usuarios
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="h-4 w-4 text-brand" />
                        {Math.round((plan.maxStorageMb / 1024) * 10) / 10} GB
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="h-4 w-4 text-brand" />
                        {plan.maxDomains === 0
                          ? 'Sin dominio propio'
                          : `${plan.maxDomains} ${plan.maxDomains === 1 ? 'dominio propio' : 'dominios propios'}`}
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="h-4 w-4 text-brand" />
                        {plan.maxFeatured === 0
                          ? 'Sin destacadas'
                          : `${plan.maxFeatured} ${plan.maxFeatured === 1 ? 'destacada' : 'destacadas'}`}
                      </li>
                    </ul>
                    <Button
                      variant={actual && !reactivable ? 'secondary' : 'primary'}
                      className="mt-5 w-full"
                      disabled={(actual && !reactivable) || gratuito || contratando === plan.id}
                      onClick={() => void contratar(plan.id)}
                    >
                      {contratando === plan.id && (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                      )}
                      {reactivable
                        ? 'Reactivar'
                        : actual
                          ? 'Plan actual'
                          : gratuito
                            ? 'Plan de entrada'
                            : 'Contratar'}
                    </Button>
                  </div>
                )
              })}
            </div>
          )}

          <p className="mt-4 flex items-start gap-2 text-xs text-muted">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            El plan cambia recién cuando la pasarela confirma el pago, no al
            abrir el checkout.
          </p>
        </>
      ) : null}
    </div>
  )
}
