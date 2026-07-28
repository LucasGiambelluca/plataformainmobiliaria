import { useState } from 'react'
import { Check, Inbox, Loader2, Mail, MessageSquare, Phone, Search, Undo2 } from 'lucide-react'
import Button from '../../components/common/Button'
import Select from '../../components/common/Select'
import Badge from '../../components/common/Badge'
import { EmptyState, ErrorState, Spinner } from '../../components/common/AsyncState'
import { useResource } from '../../hooks/useResource'
import { useDebounced } from '../../hooks/useDebounced'
import { listInquiries, setInquiryStatus } from '../../api/inquiries'
import type { Inquiry, InquiryStatus } from '../../api/schemas'
import { ApiError } from '../../lib/apiError'

const PAGE_SIZE = 20

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

const statusOptions = [
  { value: 'all', label: 'Todos los estados' },
  ...Object.entries(statusLabels).map(([value, label]) => ({ value, label })),
]

function formatFecha(iso: string): string {
  return new Date(iso).toLocaleString('es-AR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function Leads() {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [page, setPage] = useState(1)
  const [ocupadoId, setOcupadoId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const debounced = useDebounced(search)

  const leads = useResource(
    () =>
      listInquiries({
        search: debounced || undefined,
        status: status === 'all' ? undefined : (status as InquiryStatus),
        page,
        pageSize: PAGE_SIZE,
      }),
    [debounced, status, page],
  )

  const cambiar = async (lead: Inquiry, nuevo: InquiryStatus) => {
    setActionError(null)
    setOcupadoId(lead.id)
    try {
      await setInquiryStatus(lead.id, nuevo)
      leads.reload()
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'No se pudo actualizar')
    } finally {
      setOcupadoId(null)
    }
  }

  const total = leads.data?.total ?? 0
  const nuevos = leads.data?.newCount ?? 0
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-base text-ink">Leads</h1>
          <p className="text-muted">
            {leads.loading && !leads.data
              ? 'Cargando…'
              : nuevos > 0
                ? `${nuevos} sin responder de ${total}.`
                : `${total} consultas recibidas.`}
          </p>
        </div>
        {nuevos > 0 && (
          <Badge tone="accent">
            {nuevos} {nuevos === 1 ? 'nuevo' : 'nuevos'}
          </Badge>
        )}
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
            placeholder="Buscar por nombre, email o mensaje"
            className="w-full rounded-md border border-line bg-surface py-2.5 pl-10 pr-4 text-sm text-ink placeholder:text-muted focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
          />
        </div>
        <div className="w-48">
          <Select
            options={statusOptions}
            value={status}
            onChange={(e) => {
              setStatus(e.target.value)
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

      {leads.error ? (
        <ErrorState error={leads.error} onRetry={leads.reload} />
      ) : leads.loading && !leads.data ? (
        <Spinner label="Cargando consultas…" />
      ) : leads.data && leads.data.items.length === 0 ? (
        <EmptyState>
          {debounced || status !== 'all' ? (
            'Ninguna consulta coincide con el filtro.'
          ) : (
            <span className="flex flex-col items-center gap-2">
              <Inbox className="h-6 w-6" aria-hidden />
              Todavía no recibiste consultas. Llegan cuando alguien completa el
              formulario en la ficha de una de tus propiedades publicadas.
            </span>
          )}
        </EmptyState>
      ) : (
        <ul className="space-y-3">
          {leads.data?.items.map((lead) => (
            <li
              key={lead.id}
              className={`rounded-lg border bg-surface p-5 shadow-card ${
                lead.status === 'new' ? 'border-accent' : 'border-line'
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-ink">{lead.name}</p>
                    <Badge tone={statusTone[lead.status]}>
                      {statusLabels[lead.status]}
                    </Badge>
                  </div>
                  <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
                    <a
                      href={`mailto:${lead.email}`}
                      className="flex items-center gap-1.5 hover:text-brand"
                    >
                      <Mail className="h-3.5 w-3.5" />
                      {lead.email}
                    </a>
                    {lead.phone && (
                      <a
                        href={`tel:${lead.phone}`}
                        className="flex items-center gap-1.5 hover:text-brand"
                      >
                        <Phone className="h-3.5 w-3.5" />
                        {lead.phone}
                      </a>
                    )}
                  </p>
                </div>
                <span className="shrink-0 text-xs text-muted">
                  {formatFecha(lead.createdAt)}
                </span>
              </div>

              {lead.propertyTitle && (
                <p className="mt-3 flex items-center gap-1.5 text-sm text-muted">
                  <MessageSquare className="h-3.5 w-3.5 shrink-0" />
                  Sobre <span className="text-ink">{lead.propertyTitle}</span>
                </p>
              )}

              <p className="mt-2 whitespace-pre-line rounded-md bg-canvas p-3 text-sm text-ink">
                {lead.message}
              </p>

              <div className="mt-4 flex flex-wrap gap-2">
                {lead.status !== 'contacted' && (
                  <Button
                    variant="secondary"
                    disabled={ocupadoId === lead.id}
                    onClick={() => void cambiar(lead, 'contacted')}
                  >
                    {ocupadoId === lead.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    ) : (
                      <Check className="h-4 w-4" />
                    )}
                    Marcar contactado
                  </Button>
                )}
                {lead.status !== 'closed' && (
                  <Button
                    variant="secondary"
                    disabled={ocupadoId === lead.id}
                    onClick={() => void cambiar(lead, 'closed')}
                  >
                    Cerrar
                  </Button>
                )}
                {lead.status !== 'new' && (
                  <Button
                    variant="secondary"
                    disabled={ocupadoId === lead.id}
                    onClick={() => void cambiar(lead, 'new')}
                  >
                    <Undo2 className="h-4 w-4" />
                    Reabrir
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {pages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm text-muted">
          <span>
            Página {page} de {pages}
          </span>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              disabled={page <= 1 || leads.loading}
              onClick={() => setPage((p) => p - 1)}
            >
              Anterior
            </Button>
            <Button
              variant="secondary"
              disabled={page >= pages || leads.loading}
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
