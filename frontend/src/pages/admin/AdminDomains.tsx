import { useState } from 'react'
import {
  CheckCircle2,
  Clock,
  Globe,
  Loader2,
  RefreshCw,
  Search,
  Trash2,
  XCircle,
} from 'lucide-react'
import Select from '../../components/common/Select'
import Badge from '../../components/common/Badge'
import Button from '../../components/common/Button'
import { EmptyState, ErrorState, Spinner } from '../../components/common/AsyncState'
import { useResource } from '../../hooks/useResource'
import { deleteAnyDomain, listAllDomains, verifyAnyDomain } from '../../api/domains'
import type { DomainStatus } from '../../api/schemas'
import { domainStatusLabels, domainStatusTone } from '../../lib/domainLabels'
import { toApiError } from '../../lib/apiError'

const PAGE_SIZE = 25

const statusIcon: Record<DomainStatus, typeof CheckCircle2> = {
  active: CheckCircle2,
  verifying: Loader2,
  pending: Clock,
  failed: XCircle,
}

const filterOptions = [
  { value: 'all', label: 'Todos los estados' },
  { value: 'active', label: 'Activos' },
  { value: 'verifying', label: 'Propagando' },
  { value: 'pending', label: 'Sin verificar' },
  { value: 'failed', label: 'Mal apuntados' },
]

function formatFecha(iso: string | null): string {
  if (!iso) return 'Nunca'
  return new Date(iso).toLocaleString('es-AR', {
    day: '2-digit',
    month: 'short',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function AdminDomains() {
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [trabajando, setTrabajando] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  // El filtrado lo hace el servidor: la tabla cruza todas las inmobiliarias y
  // no cabe entera en memoria.
  const { data, error, loading, reload } = useResource(
    () =>
      listAllDomains({
        status: filter === 'all' ? undefined : (filter as DomainStatus),
        search: q.trim() || undefined,
        page,
        pageSize: PAGE_SIZE,
      }),
    [filter, q, page],
  )

  const total = data?.total ?? 0
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const verificar = async (id: string) => {
    setTrabajando(id)
    setAviso(null)
    try {
      const { detail } = await verifyAnyDomain(id)
      setAviso(detail ?? 'El dominio apunta correctamente a la plataforma.')
      reload()
    } catch (err) {
      setAviso(toApiError(err).message)
    } finally {
      setTrabajando(null)
    }
  }

  const eliminar = async (id: string, domain: string) => {
    setTrabajando(id)
    setAviso(null)
    try {
      await deleteAnyDomain(id)
      setAviso(`Se liberó ${domain}. Cualquier inmobiliaria puede reclamarlo de nuevo.`)
      reload()
    } catch (err) {
      setAviso(toApiError(err).message)
    } finally {
      setTrabajando(null)
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-base text-ink">Dominios</h1>
        <p className="text-muted">
          Dominios propios de todas las inmobiliarias. El estado sale del DNS: no se
          puede activar uno a mano.
        </p>
      </div>

      <div className="mb-4 flex flex-wrap gap-3">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value)
              setPage(1)
            }}
            placeholder="Buscar dominio o inmobiliaria"
            className="w-full rounded-md border border-line bg-surface py-2.5 pl-10 pr-4 text-sm text-ink placeholder:text-muted focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
          />
        </div>
        <div className="w-48">
          <Select
            options={filterOptions}
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value)
              setPage(1)
            }}
          />
        </div>
      </div>

      {aviso && (
        <p className="mb-4 rounded-md border border-line bg-canvas px-4 py-3 text-sm text-ink">
          {aviso}
        </p>
      )}

      {error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : loading && !data ? (
        <Spinner label="Cargando dominios…" />
      ) : data && data.items.length === 0 ? (
        <EmptyState>
          {q || filter !== 'all'
            ? 'Ningún dominio coincide con la búsqueda.'
            : 'Todavía no hay dominios propios cargados.'}
        </EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line bg-surface shadow-card">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line bg-canvas text-xs uppercase tracking-base text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Dominio</th>
                <th className="px-4 py-3 font-medium">Inmobiliaria</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="hidden px-4 py-3 font-medium md:table-cell">
                  Último chequeo
                </th>
                <th className="px-4 py-3 text-right font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data?.items.map((d) => {
                const Icon = statusIcon[d.status]
                const ocupado = trabajando === d.id

                return (
                  <tr key={d.id} className="hover:bg-canvas/60">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Globe className="h-4 w-4 text-muted" />
                        <span className="font-medium text-ink">{d.domain}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted">{d.tenantName}</td>
                    <td className="px-4 py-3">
                      <Badge tone={domainStatusTone[d.status]}>
                        <Icon className={`h-3.5 w-3.5 ${ocupado ? 'animate-spin' : ''}`} />
                        {domainStatusLabels[d.status]}
                      </Badge>
                    </td>
                    <td className="hidden whitespace-nowrap px-4 py-3 text-muted md:table-cell">
                      {formatFecha(d.lastCheckedAt)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="secondary"
                          onClick={() => void verificar(d.id)}
                          disabled={ocupado}
                        >
                          <RefreshCw
                            className={`h-4 w-4 ${ocupado ? 'animate-spin' : ''}`}
                          />
                          Verificar
                        </Button>
                        <button
                          onClick={() => void eliminar(d.id, d.domain)}
                          disabled={ocupado}
                          className="rounded-md p-2 text-muted hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                          aria-label={`Liberar ${d.domain}`}
                        >
                          <Trash2 className="h-4 w-4" />
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
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => p - 1)}
            >
              Anterior
            </Button>
            <Button
              variant="secondary"
              disabled={page >= pages || loading}
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
