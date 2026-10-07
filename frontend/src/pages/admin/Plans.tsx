import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  Building2,
  Globe,
  HardDrive,
  Loader2,
  Pencil,
  Plus,
  Power,
  Star,
  Users,
} from 'lucide-react'
import Button from '../../components/common/Button'
import Input from '../../components/common/Input'
import Badge from '../../components/common/Badge'
import Modal from '../../components/common/Modal'
import { EmptyState, ErrorState, Spinner } from '../../components/common/AsyncState'
import { useResource } from '../../hooks/useResource'
import { activatePlan, createPlan, deactivatePlan, listPlans, updatePlan } from '../../api/plans'
import { planFormSchema, type Plan, type PlanForm } from '../../api/schemas'
import { ApiError } from '../../lib/apiError'
import { formatARS } from '../../lib/format'

const intervalLabels = { monthly: 'mes', yearly: 'año' } as const

/** El backend guarda MB; la UI habla en GB. */
const mbToGb = (mb: number) => Math.round((mb / 1024) * 10) / 10

export default function Plans() {
  const plans = useResource(() => listPlans(), [])
  const [modal, setModal] = useState<'new' | 'edit' | null>(null)
  const [editing, setEditing] = useState<Plan | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const toggleActive = async (plan: Plan) => {
    setActionError(null)
    setBusyId(plan.id)
    try {
      await (plan.isActive ? deactivatePlan(plan.id) : activatePlan(plan.id))
      plans.reload()
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'No se pudo actualizar el plan')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-base text-ink">Planes</h1>
          <p className="text-muted">Catálogo de suscripciones.</p>
        </div>
        <Button
          onClick={() => {
            setEditing(null)
            setModal('new')
          }}
        >
          <Plus className="h-4 w-4" />
          Nuevo plan
        </Button>
      </div>

      {actionError && (
        <p role="alert" className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {actionError}
        </p>
      )}

      {plans.error ? (
        <ErrorState error={plans.error} onRetry={plans.reload} />
      ) : plans.loading && !plans.data ? (
        <Spinner label="Cargando planes…" />
      ) : plans.data && plans.data.length === 0 ? (
        <EmptyState>Todavía no hay planes cargados. Creá el primero.</EmptyState>
      ) : (
        <div className="grid gap-6 md:grid-cols-3">
          {plans.data?.map((p) => (
            <div
              key={p.id}
              className={`rounded-xl border bg-surface p-6 shadow-card ${
                p.isActive ? 'border-line' : 'border-dashed border-line opacity-75'
              }`}
            >
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold tracking-base text-ink">{p.name}</h3>
                <Badge tone={p.isActive ? 'success' : 'neutral'}>
                  {p.isActive ? 'Activo' : 'Inactivo'}
                </Badge>
              </div>
              <p className="mt-2 text-2xl font-bold tracking-base text-ink">
                {formatARS(Number(p.priceAmount))}
                <span className="text-sm font-normal text-muted">
                  {' '}
                  / {intervalLabels[p.billingInterval]}
                </span>
              </p>
              <p className="mt-1 text-xs text-muted">/{p.slug}</p>

              <ul className="mt-4 space-y-2 text-sm text-ink">
                <li className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-brand" />
                  {p.maxProperties} propiedades
                </li>
                <li className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-brand" />
                  {p.maxUsers} usuarios
                </li>
                <li className="flex items-center gap-2">
                  <HardDrive className="h-4 w-4 text-brand" />
                  {mbToGb(p.maxStorageMb)} GB de almacenamiento
                </li>
                <li className="flex items-center gap-2">
                  <Globe className="h-4 w-4 text-brand" />
                  {p.maxDomains === 0
                    ? 'Sin dominio propio'
                    : `${p.maxDomains} ${p.maxDomains === 1 ? 'dominio propio' : 'dominios propios'}`}
                </li>
                <li className="flex items-center gap-2">
                  <Star className="h-4 w-4 text-brand" />
                  {p.maxFeatured === 0
                    ? 'Sin destacadas'
                    : `${p.maxFeatured} ${p.maxFeatured === 1 ? 'destacada' : 'destacadas'}`}
                </li>
              </ul>

              <div className="mt-5 flex gap-2">
                <Button
                  variant="secondary"
                  className="flex-1"
                  onClick={() => {
                    setEditing(p)
                    setModal('edit')
                  }}
                >
                  <Pencil className="h-4 w-4" />
                  Editar
                </Button>
                <button
                  onClick={() => void toggleActive(p)}
                  disabled={busyId === p.id}
                  className="rounded-pill border border-line p-2.5 text-muted hover:bg-canvas hover:text-ink disabled:opacity-50"
                  aria-label={p.isActive ? `Desactivar ${p.name}` : `Activar ${p.name}`}
                  title={
                    p.isActive
                      ? 'Desactivar: deja de ofrecerse sin romper las suscripciones vigentes'
                      : 'Volver a ofrecer este plan'
                  }
                >
                  {busyId === p.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Power className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <PlanModal
          plan={modal === 'edit' ? editing : null}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null)
            plans.reload()
          }}
        />
      )}
    </div>
  )
}

interface PlanModalProps {
  plan: Plan | null
  onClose: () => void
  onSaved: () => void
}

function PlanModal({ plan, onClose, onSaved }: PlanModalProps) {
  const [failure, setFailure] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<PlanForm>({
    resolver: zodResolver(planFormSchema),
    defaultValues: plan
      ? {
          name: plan.name,
          slug: plan.slug,
          priceAmount: plan.priceAmount,
          maxProperties: plan.maxProperties,
          maxUsers: plan.maxUsers,
          maxStorageMb: plan.maxStorageMb,
          maxDomains: plan.maxDomains,
          maxFeatured: plan.maxFeatured,
        }
      : { maxProperties: 30, maxUsers: 2, maxStorageMb: 5120, maxDomains: 1, maxFeatured: 0 },
  })

  const onSubmit = handleSubmit(async (values) => {
    setFailure(null)
    try {
      if (plan) await updatePlan(plan.id, values)
      else await createPlan(values)
      onSaved()
    } catch (err) {
      if (err instanceof ApiError) {
        const slugIssue = err.issueFor('slug')
        if (slugIssue) setError('slug', { message: slugIssue })
        else setFailure(err.message)
        return
      }
      setFailure('No se pudo guardar el plan')
    }
  })

  return (
    <Modal open onClose={onClose} title={plan ? `Editar ${plan.name}` : 'Nuevo plan'}>
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {failure && (
          <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {failure}
          </p>
        )}

        <Input label="Nombre" error={errors.name?.message} {...register('name')} />
        <Input
          label="Slug"
          placeholder="pro"
          error={errors.slug?.message}
          {...register('slug')}
        />
        <Input
          label="Precio (ARS / mes)"
          inputMode="decimal"
          placeholder="59900"
          error={errors.priceAmount?.message}
          {...register('priceAmount')}
        />
        <div className="grid grid-cols-3 gap-3">
          <Input
            label="Máx. props"
            type="number"
            error={errors.maxProperties?.message}
            {...register('maxProperties')}
          />
          <Input
            label="Máx. usuarios"
            type="number"
            error={errors.maxUsers?.message}
            {...register('maxUsers')}
          />
          <Input
            label="Storage (MB)"
            type="number"
            error={errors.maxStorageMb?.message}
            {...register('maxStorageMb')}
          />
        </div>
        <Input
          label="Máx. dominios propios"
          type="number"
          min={0}
          // 0 deja al plan sirviendo solo por slug y subdominio.
          placeholder="0 = sin dominio propio"
          error={errors.maxDomains?.message}
          {...register('maxDomains')}
        />
        <Input
          label="Máx. propiedades destacadas"
          type="number"
          min={0}
          // Destacar ocupa el primer lugar del catálogo y el home.
          placeholder="0 = no puede destacar"
          error={errors.maxFeatured?.message}
          {...register('maxFeatured')}
        />

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            {plan ? 'Guardar' : 'Crear'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
