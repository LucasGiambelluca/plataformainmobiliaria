import { useState } from 'react'
import { ClipboardList, Loader2, Mail, MapPin, Phone } from 'lucide-react'
import Badge from '../../components/common/Badge'
import Button from '../../components/common/Button'
import Select from '../../components/common/Select'
import { EmptyState, ErrorState, Spinner } from '../../components/common/AsyncState'
import { useResource } from '../../hooks/useResource'
import { listMyAppraisals, updateAppraisalStatus } from '../../api/appraisals'
import type { Appraisal, AppraisalStatus } from '../../api/schemas'
import { ApiError } from '../../lib/apiError'
import {
  appraisalConditionLabels,
  appraisalPropertyTypeLabels,
  appraisalPurposeLabels,
  appraisalStatusLabels,
} from '../../lib/appraisalLabels'

/**
 * Bandeja de solicitudes de tasación de la inmobiliaria.
 *
 * La pantalla no chequea el plan a propósito: una inmobiliaria que dejó de ser
 * premium deja de aparecer en el portal y de recibir nuevas, pero sigue viendo
 * lo que ya recibió — son personas esperando una respuesta.
 */

const PAGE_SIZE = 20

const tonoPorEstado: Record<AppraisalStatus, 'accent' | 'brand' | 'neutral'> = {
  unassigned: 'neutral',
  new: 'accent',
  contacted: 'brand',
  completed: 'brand',
  discarded: 'neutral',
}

const opcionesEstado = [
  { value: 'all', label: 'Todos los estados' },
  ...(['new', 'contacted', 'completed', 'discarded'] as const).map((v) => ({
    value: v,
    label: appraisalStatusLabels[v],
  })),
]

const siguientes: Record<string, { valor: Exclude<AppraisalStatus, 'unassigned'>; label: string }[]> = {
  new: [
    { valor: 'contacted', label: 'Marcar contactado' },
    { valor: 'discarded', label: 'Descartar' },
  ],
  contacted: [
    { valor: 'completed', label: 'Marcar tasada' },
    { valor: 'discarded', label: 'Descartar' },
  ],
  completed: [{ valor: 'contacted', label: 'Reabrir' }],
  discarded: [{ valor: 'new', label: 'Reabrir' }],
}

function formatFecha(iso: string): string {
  return new Date(iso).toLocaleString('es-AR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function TasacionesPanel() {
  const [status, setStatus] = useState('all')
  const [page, setPage] = useState(1)
  const [ocupadoId, setOcupadoId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const solicitudes = useResource(
    () =>
      listMyAppraisals({
        status: status === 'all' ? undefined : (status as AppraisalStatus),
        page,
        pageSize: PAGE_SIZE,
      }),
    [status, page],
  )

  async function cambiar(
    id: string,
    nuevo: Exclude<AppraisalStatus, 'unassigned'>,
  ): Promise<void> {
    setActionError(null)
    setOcupadoId(id)
    try {
      await updateAppraisalStatus(id, nuevo)
      solicitudes.reload()
    } catch (err) {
      setActionError(
        err instanceof ApiError ? err.message : 'No se pudo actualizar la solicitud',
      )
    } finally {
      setOcupadoId(null)
    }
  }

  const total = solicitudes.data?.total ?? 0
  const paginas = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl text-brand">Tasaciones</h1>
          <p className="mt-1 text-sm text-muted">
            Solicitudes de tasación que te llegaron desde el portal.
          </p>
        </div>

        <div className="w-56">
          <Select
            options={opcionesEstado}
            value={status}
            onChange={(e) => {
              setStatus(e.target.value)
              setPage(1)
            }}
          />
        </div>
      </header>

      {actionError && (
        <p role="alert" className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {actionError}
        </p>
      )}

      <div className="mt-6">
        {solicitudes.loading && <Spinner label="Cargando solicitudes…" />}

        {solicitudes.error && (
          <ErrorState error={solicitudes.error} onRetry={solicitudes.reload} />
        )}

        {solicitudes.data && solicitudes.data.items.length === 0 && (
          <EmptyState>
            <ClipboardList className="mx-auto mb-2 h-8 w-8 text-muted" aria-hidden />
            Todavía no recibiste solicitudes de tasación.
          </EmptyState>
        )}

        {solicitudes.data && solicitudes.data.items.length > 0 && (
          <ul className="space-y-3">
            {solicitudes.data.items.map((s) => (
              <Tarjeta
                key={s.id}
                solicitud={s}
                ocupado={ocupadoId === s.id}
                onCambiar={cambiar}
              />
            ))}
          </ul>
        )}
      </div>

      {paginas > 1 && (
        <nav className="mt-6 flex items-center justify-center gap-3 text-sm">
          <Button
            variant="secondary"
            disabled={page === 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Anterior
          </Button>
          <span className="text-muted">
            Página {page} de {paginas}
          </span>
          <Button
            variant="secondary"
            disabled={page >= paginas}
            onClick={() => setPage((p) => p + 1)}
          >
            Siguiente
          </Button>
        </nav>
      )}
    </div>
  )
}

interface TarjetaProps {
  solicitud: Appraisal
  ocupado: boolean
  onCambiar: (id: string, nuevo: Exclude<AppraisalStatus, 'unassigned'>) => void
}

function Tarjeta({ solicitud: s, ocupado, onCambiar }: TarjetaProps) {
  const [abierta, setAbierta] = useState(false)
  const detalles = (s.details ?? null) as Record<string, unknown> | null

  return (
    <li className="rounded-xl border border-line bg-surface p-5 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-medium text-ink">{s.name}</h2>
            <Badge tone={tonoPorEstado[s.status]}>{appraisalStatusLabels[s.status]}</Badge>
            {s.assignedAutomatically && (
              <span className="text-xs text-muted">asignada por el portal</span>
            )}
          </div>

          <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
            <span className="inline-flex items-center gap-1">
              <Phone className="h-3.5 w-3.5" aria-hidden />
              {s.phone}
            </span>
            <span className="inline-flex items-center gap-1">
              <Mail className="h-3.5 w-3.5" aria-hidden />
              {s.email}
            </span>
          </p>
        </div>

        <span className="text-xs text-muted">{formatFecha(s.createdAt)}</span>
      </div>

      <p className="mt-3 flex items-center gap-1.5 text-sm text-ink">
        <MapPin className="h-4 w-4 text-brand" aria-hidden />
        {s.address}
        {s.neighborhood ? `, ${s.neighborhood}` : ''}, {s.city}
      </p>

      <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted">
        <Dato label="Tipo">{appraisalPropertyTypeLabels[s.propertyType]}</Dato>
        <Dato label="Destino">{appraisalPurposeLabels[s.purpose]}</Dato>
        {s.condition && (
          <Dato label="Estado">{appraisalConditionLabels[s.condition]}</Dato>
        )}
        {s.areaM2 && <Dato label="Superficie">{s.areaM2} m²</Dato>}
        {s.rooms !== null && <Dato label="Dormitorios">{s.rooms}</Dato>}
        {s.bathrooms !== null && <Dato label="Baños">{s.bathrooms}</Dato>}
      </dl>

      {s.comments && (
        <blockquote className="mt-3 border-l-2 border-brand bg-canvas px-3 py-2 text-sm text-ink">
          {s.comments}
        </blockquote>
      )}

      {detalles && Object.keys(detalles).length > 0 && (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setAbierta((v) => !v)}
            className="text-sm text-brand underline"
          >
            {abierta ? 'Ocultar información adicional' : 'Ver información adicional'}
          </button>

          {abierta && (
            <pre className="mt-2 overflow-x-auto rounded-md bg-canvas p-3 text-xs text-ink">
              {JSON.stringify(detalles, null, 2)}
            </pre>
          )}
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-3">
        {ocupado && <Loader2 className="h-4 w-4 animate-spin text-muted" aria-hidden />}
        {(siguientes[s.status] ?? []).map((accion) => (
          <Button
            key={accion.valor}
            variant="secondary"
            disabled={ocupado}
            onClick={() => onCambiar(s.id, accion.valor)}
          >
            {accion.label}
          </Button>
        ))}
      </div>
    </li>
  )
}

function Dato({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <span>
      <dt className="inline text-xs uppercase tracking-wide">{label}: </dt>
      <dd className="inline text-ink">{children}</dd>
    </span>
  )
}
