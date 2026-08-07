import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Check, Copy, TriangleAlert } from 'lucide-react'
import Button from '../../components/common/Button'
import Input from '../../components/common/Input'
import Badge from '../../components/common/Badge'
import Modal from '../../components/common/Modal'
import { ErrorState, Spinner } from '../../components/common/AsyncState'
import { useResource } from '../../hooks/useResource'
import {
  activatePaymentMode,
  getPaymentSettings,
  savePaymentCredentials,
} from '../../api/paymentSettings'
import {
  paymentCredentialsFormSchema,
  type PaymentCredentialsForm,
  type PaymentMode,
} from '../../api/schemas'
import { ApiError } from '../../lib/apiError'

const modeLabels: Record<PaymentMode, string> = {
  sandbox: 'Sandbox (pruebas)',
  production: 'Producción',
}

export default function PaymentSettings() {
  const settings = useResource(() => getPaymentSettings(), [])
  const [actionError, setActionError] = useState<string | null>(null)
  const [confirmando, setConfirmando] = useState<PaymentMode | null>(null)
  const [copiado, setCopiado] = useState(false)

  const reload = settings.reload

  const copiarWebhook = async (url: string) => {
    await navigator.clipboard.writeText(url)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2000)
  }

  const activar = async (mode: PaymentMode) => {
    setActionError(null)
    try {
      await activatePaymentMode(mode)
      setConfirmando(null)
      reload()
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'No se pudo activar')
    }
  }

  if (settings.error) return <ErrorState error={settings.error} onRetry={reload} />
  if (!settings.data) return <Spinner />

  const s = settings.data

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-base text-ink">Pasarela de pagos</h1>
        <p className="text-muted">Credenciales de MercadoPago con las que cobra la plataforma.</p>
      </div>

      {actionError && (
        <div className="mb-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
          {actionError}
        </div>
      )}

      <div className="mb-6 rounded-lg border border-line bg-surface p-4">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <span className="text-sm text-muted">Modo activo:</span>
          <Badge tone={s.activeMode === 'production' ? 'success' : 'warning'}>
            {modeLabels[s.activeMode]}
          </Badge>
          {s.updatedAt && (
            <span className="text-xs text-muted">
              Actualizado {new Date(s.updatedAt).toLocaleString('es-AR')}
              {s.updatedBy ? ` por ${s.updatedBy}` : ''}
            </span>
          )}
        </div>

        {/* El paso que siempre se olvida: sin esta URL cargada en MercadoPago
            los pagos entran pero nadie se entera, y quedan pendientes. */}
        <p className="mb-2 text-sm text-ink">
          Pegá esta URL en <strong>Tus integraciones → Webhooks</strong> del panel de
          MercadoPago:
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded bg-canvas px-3 py-2 text-sm">
            {s.webhookUrl}
          </code>
          <Button variant="secondary" onClick={() => void copiarWebhook(s.webhookUrl)}>
            {copiado ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copiado ? 'Copiado' : 'Copiar'}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {(['sandbox', 'production'] as const).map((mode) => (
          <CredentialCard
            key={mode}
            mode={mode}
            status={s.credentials[mode]}
            isActive={s.activeMode === mode}
            onSaved={reload}
            onActivate={() => setConfirmando(mode)}
          />
        ))}
      </div>

      {confirmando && (
        <ConfirmActivate
          mode={confirmando}
          onClose={() => setConfirmando(null)}
          onConfirm={() => void activar(confirmando)}
        />
      )}
    </div>
  )
}

interface CardProps {
  mode: PaymentMode
  status: { configured: boolean; last4: string | null }
  isActive: boolean
  onSaved: () => void
  onActivate: () => void
}

function CredentialCard({ mode, status, isActive, onSaved, onActivate }: CardProps) {
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<PaymentCredentialsForm>({ resolver: zodResolver(paymentCredentialsFormSchema) })

  const onSubmit = handleSubmit(async (form) => {
    setError(null)
    setMensaje(null)
    try {
      const res = await savePaymentCredentials(mode, form)
      setMensaje(
        res.verified
          ? 'Credenciales guardadas y verificadas contra MercadoPago.'
          : 'Credenciales guardadas. No se pudo verificar el token: MercadoPago no respondió.',
      )
      reset()
      onSaved()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo guardar')
    }
  })

  return (
    <form onSubmit={onSubmit} className="rounded-lg border border-line bg-surface p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-medium text-ink">{modeLabels[mode]}</h2>
        {isActive ? (
          <Badge tone="success">Activa</Badge>
        ) : (
          <button
            type="button"
            onClick={onActivate}
            disabled={!status.configured}
            className="text-sm text-brand hover:underline disabled:cursor-not-allowed disabled:text-muted disabled:no-underline"
          >
            Activar
          </button>
        )}
      </div>

      <p className="mb-3 text-xs text-muted">
        {status.configured ? `Cargada · termina en ${status.last4}` : 'Sin configurar'}
      </p>

      <div className="space-y-3">
        <Input
          label="Access token"
          type="password"
          autoComplete="off"
          placeholder={status.configured ? `···· ${status.last4}` : 'APP_USR-…'}
          error={errors.accessToken?.message}
          {...register('accessToken')}
        />
        <Input
          label="Webhook secret"
          type="password"
          autoComplete="off"
          placeholder={status.configured ? '···· (cargado)' : 'Clave secreta del webhook'}
          error={errors.webhookSecret?.message}
          {...register('webhookSecret')}
        />
      </div>

      {/* Los dos campos van juntos: son campos que no se pueden leer, y un
          formulario donde vacío a veces significa "no lo cambies" es el que
          termina dejando la plataforma sin cobrar. */}
      <p className="mt-2 text-xs text-muted">
        Se reemplazan los dos juntos. El webhook secret no se puede verificar hasta que
        llegue el primer aviso de MercadoPago.
      </p>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      {mensaje && <p className="mt-3 text-sm text-emerald-700">{mensaje}</p>}

      <div className="mt-4">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Guardando…' : 'Guardar'}
        </Button>
      </div>
    </form>
  )
}

function ConfirmActivate({
  mode,
  onClose,
  onConfirm,
}: {
  mode: PaymentMode
  onClose: () => void
  onConfirm: () => void
}) {
  return (
    <Modal open onClose={onClose} title={`Activar ${modeLabels[mode]}`}>
      <div className="flex gap-3">
        <TriangleAlert className="h-5 w-5 shrink-0 text-amber-500" />
        <div className="space-y-2 text-sm text-ink">
          <p>
            Las suscripciones creadas con las credenciales actuales no se van a poder
            cancelar ni consultar desde acá después del cambio: MercadoPago no reconoce
            una suscripción de otra cuenta.
          </p>
          <p className="text-muted">
            Los cobros ya autorizados siguen su curso en la cuenta vieja.
          </p>
        </div>
      </div>

      <div className="mt-6 flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="button" onClick={onConfirm}>
          Activar igual
        </Button>
      </div>
    </Modal>
  )
}
