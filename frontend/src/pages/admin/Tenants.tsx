import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate } from 'react-router-dom'
import { Ban, Eye, Loader2, Pencil, Play, Plus, Search } from 'lucide-react'
import Button from '../../components/common/Button'
import Input from '../../components/common/Input'
import Select from '../../components/common/Select'
import Badge from '../../components/common/Badge'
import Modal from '../../components/common/Modal'
import { EmptyState, ErrorState, Spinner } from '../../components/common/AsyncState'
import { useResource } from '../../hooks/useResource'
import { useDebounced } from '../../hooks/useDebounced'
import { createTenant, listTenants, updateTenant } from '../../api/tenants'
import { listPlans } from '../../api/plans'
import {
  newTenantFormSchema,
  tenantFormSchema,
  type NewTenantForm,
  type SubscriptionStatus,
  type TenantForm,
  type TenantListItem,
} from '../../api/schemas'
import { ApiError } from '../../lib/apiError'
import { useAuth } from '../../store/auth'

const PAGE_SIZE = 20

const activeOptions = [
  { value: 'all', label: 'Todas' },
  { value: 'true', label: 'Activas' },
  { value: 'false', label: 'Suspendidas' },
]

const subStatusLabels: Record<SubscriptionStatus, string> = {
  trialing: 'Trial',
  active: 'Activa',
  past_due: 'Pago vencido',
  canceled: 'Cancelada',
  suspended: 'Suspendida',
}

const subStatusTone: Record<SubscriptionStatus, 'success' | 'brand' | 'warning' | 'danger'> = {
  trialing: 'brand',
  active: 'success',
  past_due: 'warning',
  canceled: 'danger',
  suspended: 'danger',
}

/**
 * El estado que ve el super admin combina dos cosas del backend: la baja
 * administrativa del tenant (`isActive`) y el estado de su suscripción.
 * La baja manda: una inmobiliaria suspendida se muestra suspendida aunque su
 * suscripción figure al día.
 */
function statusOf(t: TenantListItem) {
  if (!t.isActive) return { label: 'Suspendida', tone: 'danger' as const }
  const sub = t.subscriptions[0]
  if (!sub) return { label: 'Sin suscripción', tone: 'warning' as const }
  return { label: subStatusLabels[sub.status], tone: subStatusTone[sub.status] }
}

export default function Tenants() {
  const [search, setSearch] = useState('')
  const [activeFilter, setActiveFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [modal, setModal] = useState<'new' | 'edit' | null>(null)
  const [editing, setEditing] = useState<TenantListItem | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const navigate = useNavigate()
  const startImpersonation = useAuth((s) => s.startImpersonation)

  const debouncedSearch = useDebounced(search)

  const tenants = useResource(
    () =>
      listTenants({
        search: debouncedSearch || undefined,
        isActive: activeFilter === 'all' ? undefined : activeFilter === 'true',
        page,
        pageSize: PAGE_SIZE,
      }),
    [debouncedSearch, activeFilter, page],
  )

  // Los planes alimentan el selector de la edición; se piden una sola vez.
  const plans = useResource(() => listPlans(), [])

  const reload = tenants.reload

  const toggleActive = async (t: TenantListItem) => {
    setActionError(null)
    setBusyId(t.id)
    try {
      await updateTenant(t.id, { isActive: !t.isActive })
      reload()
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'No se pudo actualizar')
    } finally {
      setBusyId(null)
    }
  }

  const verSuPanel = async (t: TenantListItem) => {
    setActionError(null)
    setBusyId(t.id)
    try {
      await startImpersonation(t.id)
      navigate('/panel')
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'No se pudo abrir su panel')
      setBusyId(null)
    }
    // Sin finally: si salió bien ya se navegó a otra pantalla y este componente
    // se desmontó. Tocar su estado ahí sería actualizar algo que no existe.
  }

  const total = tenants.data?.total ?? 0
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-base text-ink">Inmobiliarias</h1>
          <p className="text-muted">
            {tenants.loading && !tenants.data ? 'Cargando…' : `${total} registradas.`}
          </p>
        </div>
        <Button
          onClick={() => {
            setEditing(null)
            setModal('new')
          }}
        >
          <Plus className="h-4 w-4" />
          Nueva inmobiliaria
        </Button>
      </div>

      <div className="mb-4 flex flex-wrap gap-3">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
            placeholder="Buscar por nombre o slug"
            className="w-full rounded-md border border-line bg-surface py-2.5 pl-10 pr-4 text-sm text-ink placeholder:text-muted focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
          />
        </div>
        <div className="w-48">
          <Select
            options={activeOptions}
            value={activeFilter}
            onChange={(e) => {
              setActiveFilter(e.target.value)
              setPage(1)
            }}
          />
        </div>
      </div>

      {actionError && (
        <p role="alert" className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {actionError}
        </p>
      )}

      {tenants.error ? (
        <ErrorState error={tenants.error} onRetry={reload} />
      ) : tenants.loading && !tenants.data ? (
        <Spinner label="Cargando inmobiliarias…" />
      ) : tenants.data && tenants.data.items.length === 0 ? (
        <EmptyState>
          {debouncedSearch || activeFilter !== 'all'
            ? 'Ninguna inmobiliaria coincide con el filtro.'
            : 'Todavía no hay inmobiliarias registradas.'}
        </EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line bg-surface shadow-card">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line bg-canvas text-xs uppercase tracking-base text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Inmobiliaria</th>
                <th className="px-4 py-3 font-medium">Plan</th>
                <th className="hidden px-4 py-3 font-medium md:table-cell">Props</th>
                <th className="hidden px-4 py-3 font-medium md:table-cell">Usuarios</th>
                <th className="hidden px-4 py-3 font-medium lg:table-cell">Alta</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 text-right font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {tenants.data?.items.map((t) => {
                const status = statusOf(t)
                const plan = t.subscriptions[0]?.plan
                return (
                  <tr key={t.id} className="hover:bg-canvas/60">
                    <td className="px-4 py-3">
                      <p className="font-medium text-ink">{t.name}</p>
                      <p className="text-xs text-muted">/{t.slug}</p>
                    </td>
                    <td className="px-4 py-3">
                      {plan ? <Badge tone="brand">{plan.name}</Badge> : <span className="text-muted">—</span>}
                    </td>
                    <td className="hidden px-4 py-3 text-muted md:table-cell">{t._count.properties}</td>
                    <td className="hidden px-4 py-3 text-muted md:table-cell">{t._count.users}</td>
                    <td className="hidden px-4 py-3 text-muted lg:table-cell">
                      {new Date(t.createdAt).toLocaleDateString('es-AR')}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={status.tone}>{status.label}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <button
                          onClick={() => void verSuPanel(t)}
                          disabled={busyId === t.id}
                          className="rounded-md p-2 text-muted hover:bg-brand/10 hover:text-brand disabled:opacity-50"
                          aria-label={`Ver el panel de ${t.name} como soporte`}
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => {
                            setEditing(t)
                            setModal('edit')
                          }}
                          className="rounded-md p-2 text-muted hover:bg-brand/10 hover:text-brand"
                          aria-label={`Editar ${t.name}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => void toggleActive(t)}
                          disabled={busyId === t.id}
                          className={`rounded-md p-2 disabled:opacity-50 ${
                            t.isActive
                              ? 'text-muted hover:bg-red-50 hover:text-red-600'
                              : 'text-muted hover:bg-emerald-50 hover:text-emerald-600'
                          }`}
                          aria-label={t.isActive ? `Suspender ${t.name}` : `Reactivar ${t.name}`}
                        >
                          {busyId === t.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : t.isActive ? (
                            <Ban className="h-4 w-4" />
                          ) : (
                            <Play className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
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
              disabled={page <= 1 || tenants.loading}
              onClick={() => setPage((p) => p - 1)}
            >
              Anterior
            </Button>
            <Button
              variant="secondary"
              disabled={page >= pages || tenants.loading}
              onClick={() => setPage((p) => p + 1)}
            >
              Siguiente
            </Button>
          </div>
        </div>
      )}

      {modal === 'new' && (
        <NewTenantModal
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null)
            setPage(1)
            reload()
          }}
        />
      )}

      {modal === 'edit' && editing && (
        <EditTenantModal
          tenant={editing}
          planOptions={(plans.data ?? []).map((p) => ({ value: p.id, label: p.name }))}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null)
            reload()
          }}
        />
      )}
    </div>
  )
}

/* --------------------------- alta --------------------------- */

function NewTenantModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [failure, setFailure] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<NewTenantForm>({ resolver: zodResolver(newTenantFormSchema) })

  const onSubmit = handleSubmit(async (values) => {
    setFailure(null)
    try {
      await createTenant(values)
      onSaved()
    } catch (err) {
      if (err instanceof ApiError) {
        // El backend nombra el campo del conflicto cuando puede.
        const slugIssue = err.issueFor('slug')
        if (slugIssue) setError('slug', { message: slugIssue })
        else setFailure(err.message)
        return
      }
      setFailure('No se pudo crear la inmobiliaria')
    }
  })

  return (
    <Modal open onClose={onClose} title="Nueva inmobiliaria">
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {failure && (
          <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {failure}
          </p>
        )}

        <Input label="Nombre" error={errors.name?.message} {...register('name')} />
        <Input
          label="Slug (subdominio)"
          placeholder="inmobiliaria-norte"
          error={errors.slug?.message}
          {...register('slug')}
        />

        <p className="pt-2 text-sm font-medium text-ink">Usuario administrador</p>
        <Input label="Nombre" error={errors.adminName?.message} {...register('adminName')} />
        <Input
          label="Email"
          type="email"
          error={errors.adminEmail?.message}
          {...register('adminEmail')}
        />
        <Input
          label="Contraseña"
          type="password"
          autoComplete="new-password"
          error={errors.adminPassword?.message}
          {...register('adminPassword')}
        />
        <p className="text-xs text-muted">
          Se crea con el plan Básico y la suscripción activa.
        </p>

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            Crear
          </Button>
        </div>
      </form>
    </Modal>
  )
}

/* --------------------------- edición --------------------------- */

interface EditProps {
  tenant: TenantListItem
  planOptions: { value: string; label: string }[]
  onClose: () => void
  onSaved: () => void
}

function EditTenantModal({ tenant, planOptions, onClose, onSaved }: EditProps) {
  const [failure, setFailure] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<TenantForm>({
    resolver: zodResolver(tenantFormSchema),
    defaultValues: {
      name: tenant.name,
      slug: tenant.slug,
      planId: tenant.subscriptions[0]?.plan.id ?? '',
    },
  })

  const onSubmit = handleSubmit(async (values) => {
    setFailure(null)
    try {
      // El slug no es editable: cambiarlo rompería la web pública del tenant.
      await updateTenant(tenant.id, { name: values.name, planId: values.planId })
      onSaved()
    } catch (err) {
      setFailure(err instanceof ApiError ? err.message : 'No se pudo guardar')
    }
  })

  return (
    <Modal open onClose={onClose} title={`Editar ${tenant.name}`}>
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {failure && (
          <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {failure}
          </p>
        )}

        <Input label="Nombre" error={errors.name?.message} {...register('name')} />
        <Input label="Slug (subdominio)" disabled {...register('slug')} />
        <Select
          label="Plan"
          options={planOptions}
          placeholder={planOptions.length ? 'Elegí un plan' : 'Sin planes disponibles'}
          error={errors.planId?.message}
          {...register('planId')}
        />

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            Guardar
          </Button>
        </div>
      </form>
    </Modal>
  )
}
