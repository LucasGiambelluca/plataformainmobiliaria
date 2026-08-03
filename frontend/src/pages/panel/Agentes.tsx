import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2, Mail, Phone, Plus, ShieldCheck, UserRound, Undo2 } from 'lucide-react'
import Button from '../../components/common/Button'
import Input from '../../components/common/Input'
import Select from '../../components/common/Select'
import Badge from '../../components/common/Badge'
import Modal from '../../components/common/Modal'
import { EmptyState, ErrorState, Spinner } from '../../components/common/AsyncState'
import { useResource } from '../../hooks/useResource'
import {
  createTeamMember,
  deactivateTeamMember,
  listTeam,
  updateTeamMember,
} from '../../api/users'
import { getSubscription } from '../../api/subscription'
import {
  agentFormSchema,
  type AgentForm,
  type TenantRole,
  type TenantUser,
} from '../../api/schemas'
import { ApiError, toApiError } from '../../lib/apiError'

const roleLabels: Record<TenantRole, string> = {
  tenant_admin: 'Administrador',
  agent: 'Agente',
}

const roleOptions = Object.entries(roleLabels).map(([value, label]) => ({ value, label }))

const roleHelp: Record<TenantRole, string> = {
  tenant_admin: 'Puede tocar todo: propiedades, sitio, dominio, plan y equipo.',
  agent: 'Carga y edita propiedades, y atiende las consultas que llegan.',
}

export default function Agentes() {
  const equipo = useResource(listTeam)
  // El cupo de usuarios lo define el plan: mostrarlo evita que el error de
  // límite aparezca recién al apretar Crear.
  const suscripcion = useResource(getSubscription)

  const [creando, setCreando] = useState(false)
  const [ocupadoId, setOcupadoId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const usuarios = equipo.data ?? []
  const uso = suscripcion.data?.usage.users

  const cambiarEstado = async (u: TenantUser, isActive: boolean) => {
    setOcupadoId(u.id)
    setError(null)
    try {
      if (isActive) {
        await updateTeamMember(u.id, { isActive: true })
      } else {
        await deactivateTeamMember(u.id)
      }
      equipo.reload()
      suscripcion.reload()
    } catch (err) {
      setError(toApiError(err).message)
    } finally {
      setOcupadoId(null)
    }
  }

  const cambiarRol = async (u: TenantUser, role: TenantRole) => {
    if (role === u.role) return
    setOcupadoId(u.id)
    setError(null)
    try {
      await updateTeamMember(u.id, { role })
      equipo.reload()
    } catch (err) {
      setError(toApiError(err).message)
    } finally {
      setOcupadoId(null)
    }
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-base text-ink">Equipo</h1>
          <p className="text-muted">
            Quiénes pueden entrar al panel de tu inmobiliaria.
            {uso && (
              <>
                {' '}
                Usás <strong className="text-ink">{uso.used}</strong> de {uso.limit} lugares
                de tu plan.
              </>
            )}
          </p>
        </div>
        <Button onClick={() => setCreando(true)}>
          <Plus className="h-4 w-4" aria-hidden />
          Agregar persona
        </Button>
      </div>

      {error && (
        <p role="alert" className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {equipo.error ? (
        <ErrorState error={equipo.error} onRetry={equipo.reload} />
      ) : equipo.loading && !equipo.data ? (
        <Spinner label="Cargando el equipo…" />
      ) : usuarios.length === 0 ? (
        <EmptyState>Todavía no hay nadie más en tu equipo.</EmptyState>
      ) : (
        <div className="space-y-3">
          {usuarios.map((u) => (
            <div
              key={u.id}
              className={`rounded-lg border border-line bg-surface p-4 shadow-card ${
                u.isActive ? '' : 'opacity-60'
              }`}
            >
              <div className="flex flex-wrap items-center gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-canvas text-muted">
                  {u.role === 'tenant_admin' ? (
                    <ShieldCheck className="h-5 w-5" aria-hidden />
                  ) : (
                    <UserRound className="h-5 w-5" aria-hidden />
                  )}
                </span>

                <div className="min-w-0">
                  <p className="truncate font-medium text-ink">{u.name ?? u.email}</p>
                  <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
                    <span className="inline-flex items-center gap-1">
                      <Mail className="h-3.5 w-3.5" aria-hidden />
                      {u.email}
                    </span>
                    {u.phone && (
                      <span className="inline-flex items-center gap-1">
                        <Phone className="h-3.5 w-3.5" aria-hidden />
                        {u.phone}
                      </span>
                    )}
                  </p>
                </div>

                <div className="ml-auto flex flex-wrap items-center gap-3">
                  {!u.isActive && <Badge tone="neutral">Sin acceso</Badge>}

                  <Select
                    options={roleOptions}
                    value={u.role}
                    disabled={ocupadoId === u.id || !u.isActive}
                    onChange={(e) => void cambiarRol(u, e.target.value as TenantRole)}
                    aria-label={`Rol de ${u.name ?? u.email}`}
                    className="w-44"
                  />

                  {u.isActive ? (
                    <Button
                      variant="secondary"
                      onClick={() => void cambiarEstado(u, false)}
                      disabled={ocupadoId === u.id}
                    >
                      {ocupadoId === u.id && (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                      )}
                      Quitar acceso
                    </Button>
                  ) : (
                    <Button
                      variant="secondary"
                      onClick={() => void cambiarEstado(u, true)}
                      disabled={ocupadoId === u.id}
                    >
                      <Undo2 className="h-4 w-4" aria-hidden />
                      Restaurar
                    </Button>
                  )}
                </div>
              </div>

              <p className="mt-2 text-xs text-muted">{roleHelp[u.role]}</p>
            </div>
          ))}
        </div>
      )}

      {creando && (
        <NuevaPersonaModal
          onClose={() => setCreando(false)}
          onSaved={() => {
            setCreando(false)
            equipo.reload()
            suscripcion.reload()
          }}
        />
      )}
    </div>
  )
}

/* --------------------------- alta --------------------------- */

interface Props {
  onClose: () => void
  onSaved: () => void
}

function NuevaPersonaModal({ onClose, onSaved }: Props) {
  const [failure, setFailure] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<AgentForm>({
    resolver: zodResolver(agentFormSchema),
    defaultValues: { role: 'agent' },
  })

  const onSubmit = handleSubmit(async (values) => {
    setFailure(null)
    try {
      await createTeamMember(values)
      onSaved()
    } catch (err) {
      if (err instanceof ApiError) {
        // El backend nombra el campo cuando el problema es de un campo.
        const emailIssue = err.issueFor('email')
        if (emailIssue) setError('email', { message: emailIssue })
        else setFailure(err.message)
        return
      }
      setFailure('No se pudo crear la persona')
    }
  })

  return (
    <Modal open onClose={onClose} title="Agregar persona" dismissOnBackdrop={false}>
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {failure && (
          <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {failure}
          </p>
        )}

        <Input label="Nombre" error={errors.name?.message} {...register('name')} />
        <Input
          label="Email"
          type="email"
          autoComplete="off"
          error={errors.email?.message}
          {...register('email')}
        />
        <Input
          label="Teléfono (opcional)"
          error={errors.phone?.message}
          {...register('phone')}
        />
        <Input
          label="Contraseña"
          type="password"
          autoComplete="new-password"
          error={errors.password?.message}
          {...register('password')}
        />
        <Select label="Rol" options={roleOptions} error={errors.role?.message} {...register('role')} />

        <p className="text-xs text-muted">
          La persona entra con este email y contraseña. Después puede cambiarla desde su
          propia sesión.
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
