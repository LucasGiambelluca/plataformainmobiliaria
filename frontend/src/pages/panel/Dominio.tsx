import { useState } from 'react'
import {
  CheckCircle2,
  Clock,
  Copy,
  Globe,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
  XCircle,
} from 'lucide-react'
import Button from '../../components/common/Button'
import Badge from '../../components/common/Badge'
import Input from '../../components/common/Input'
import { EmptyState, ErrorState, Spinner } from '../../components/common/AsyncState'
import { useResource } from '../../hooks/useResource'
import { addDomain, deleteDomain, listDomains, verifyDomain } from '../../api/domains'
import { domainFormSchema, type CustomDomain, type DomainStatus } from '../../api/schemas'
import {
  domainStatusHelp,
  domainStatusLabels,
  domainStatusTone,
} from '../../lib/domainLabels'
import { toApiError } from '../../lib/apiError'

const statusIcon: Record<DomainStatus, typeof CheckCircle2> = {
  active: CheckCircle2,
  verifying: Loader2,
  pending: Clock,
  failed: XCircle,
}

/** Un subdominio se apunta con CNAME; un dominio pelado no admite CNAME. */
function esApex(domain: string): boolean {
  return domain.split('.').length <= 2
}

export default function Dominio() {
  const { data, error, loading, reload, setData } = useResource(listDomains)

  const [input, setInput] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  // Resultado del último chequeo por dominio: es donde el backend explica por
  // qué no pasó, y es lo único accionable que ve el usuario.
  const [detalles, setDetalles] = useState<Record<string, string>>({})
  const [verificando, setVerificando] = useState<string | null>(null)
  const [copiado, setCopiado] = useState(false)

  const dnsTarget = data?.dnsTarget ?? ''
  const domains = data?.domains ?? []

  const agregar = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)

    const parsed = domainFormSchema.safeParse({ domain: input })
    if (!parsed.success) {
      setFormError(parsed.error.issues[0].message)
      return
    }

    setAdding(true)
    try {
      const created = await addDomain(parsed.data.domain)
      setData((current) => ({ ...current, domains: [created, ...current.domains] }))
      setInput('')
      // Se verifica de una: si el DNS ya estaba configurado, queda activo sin
      // que el usuario tenga que tocar nada más.
      void verificar(created.id)
    } catch (err) {
      setFormError(toApiError(err).message)
    } finally {
      setAdding(false)
    }
  }

  const verificar = async (id: string) => {
    setVerificando(id)
    try {
      const { domain, detail } = await verifyDomain(id)
      setData((current) => ({
        ...current,
        domains: current.domains.map((d) => (d.id === id ? domain : d)),
      }))
      setDetalles((prev) => ({ ...prev, [id]: detail ?? '' }))
    } catch (err) {
      setDetalles((prev) => ({ ...prev, [id]: toApiError(err).message }))
    } finally {
      setVerificando(null)
    }
  }

  const eliminar = async (d: CustomDomain) => {
    try {
      await deleteDomain(d.id)
      setData((current) => ({
        ...current,
        domains: current.domains.filter((r) => r.id !== d.id),
      }))
    } catch (err) {
      setFormError(toApiError(err).message)
    }
  }

  const copiarTarget = async () => {
    await navigator.clipboard.writeText(dnsTarget)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2000)
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-base text-ink">Dominio Propio</h1>
        <p className="text-muted">
          Conectá tu dominio para servir tu web con SSL automático.
        </p>
      </div>

      {error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : loading && !data ? (
        <Spinner label="Cargando dominios…" />
      ) : (
        <>
          <form
            onSubmit={agregar}
            className="mb-6 rounded-lg border border-line bg-surface p-5 shadow-card"
          >
            <div className="flex flex-wrap items-start gap-3">
              <div className="relative min-w-0 flex-1">
                <Globe className="pointer-events-none absolute left-3 top-[1.15rem] h-4 w-4 -translate-y-1/2 text-muted" />
                <Input
                  value={input}
                  onChange={(e) => {
                    setInput(e.target.value)
                    setFormError(null)
                  }}
                  placeholder="tu-inmobiliaria.com"
                  className="pl-10"
                  error={formError ?? undefined}
                />
              </div>
              <Button type="submit" disabled={adding}>
                {adding ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                Agregar dominio
              </Button>
            </div>
          </form>

          <div className="mb-6 rounded-lg border border-line bg-canvas p-5 text-sm">
            <p className="font-medium text-ink">Instrucciones DNS</p>
            <p className="mt-1 text-muted">
              En tu proveedor de dominio, creá un registro <strong>CNAME</strong>{' '}
              apuntando a:
            </p>
            <div className="mt-2 flex items-center gap-2">
              <code className="inline-block rounded bg-surface px-3 py-1.5 font-mono text-brand-dark">
                {dnsTarget}
              </code>
              <button
                type="button"
                onClick={copiarTarget}
                className="rounded-md p-2 text-muted hover:bg-surface hover:text-ink"
                aria-label="Copiar destino"
              >
                <Copy className="h-4 w-4" />
              </button>
              {copiado && <span className="text-xs text-brand-dark">Copiado</span>}
            </div>
            <p className="mt-2 text-muted">
              Si querés usar el dominio pelado (sin <code>www</code>), tu proveedor no
              permite CNAME en la raíz: usá un registro <strong>A</strong> con la IP de{' '}
              <code className="font-mono">{dnsTarget}</code>. El <code>www</code> se sirve
              solo, no hace falta cargarlo aparte.
            </p>
          </div>

          {domains.length === 0 ? (
            <EmptyState>
              Todavía no conectaste ningún dominio. Mientras tanto tu web sigue
              funcionando por su dirección de la plataforma.
            </EmptyState>
          ) : (
            <div className="space-y-3">
              {domains.map((d) => {
                const Icon = statusIcon[d.status]
                const enChequeo = verificando === d.id
                const detalle = detalles[d.id]

                return (
                  <div
                    key={d.id}
                    className="rounded-lg border border-line bg-surface p-4 shadow-card"
                  >
                    <div className="flex flex-wrap items-center gap-3">
                      <Globe className="h-5 w-5 shrink-0 text-muted" />
                      <div className="min-w-0">
                        <p className="truncate font-medium text-ink">{d.domain}</p>
                        <p className="text-xs text-muted">
                          {esApex(d.domain) ? 'Registro A → ' : 'CNAME → '}
                          {d.dnsTarget ?? dnsTarget}
                        </p>
                      </div>
                      <div className="ml-auto flex items-center gap-3">
                        <Badge tone={domainStatusTone[d.status]}>
                          <Icon
                            className={`h-3.5 w-3.5 ${enChequeo ? 'animate-spin' : ''}`}
                          />
                          {domainStatusLabels[d.status]}
                        </Badge>
                        <Button
                          variant="secondary"
                          onClick={() => void verificar(d.id)}
                          disabled={enChequeo}
                        >
                          <RefreshCw
                            className={`h-4 w-4 ${enChequeo ? 'animate-spin' : ''}`}
                          />
                          Verificar
                        </Button>
                        <button
                          onClick={() => void eliminar(d)}
                          className="rounded-md p-2 text-muted hover:bg-red-50 hover:text-red-600"
                          aria-label={`Eliminar ${d.domain}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    <p className="mt-2 text-xs text-muted">
                      {detalle || domainStatusHelp[d.status]}
                    </p>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}
