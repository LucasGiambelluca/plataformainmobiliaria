import { useState } from 'react'
import { CheckCircle2, Clock, Globe, Loader2, Plus, Trash2, XCircle } from 'lucide-react'
import Button from '../../components/common/Button'
import Badge from '../../components/common/Badge'
import {
  domains as seed,
  domainStatusLabels,
  type CustomDomain,
} from '../../data/panelMock'

const statusTone = {
  active: 'success',
  verifying: 'warning',
  pending: 'neutral',
  failed: 'danger',
} as const

const statusIcon = {
  active: CheckCircle2,
  verifying: Loader2,
  pending: Clock,
  failed: XCircle,
} as const

export default function Dominio() {
  const [rows, setRows] = useState<CustomDomain[]>(seed)
  const [input, setInput] = useState('')

  const add = (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim()) return
    setRows((rs) => [
      {
        id: String(Date.now()),
        domain: input.trim(),
        status: 'pending',
        dnsTarget: 'cname.inmohub.com',
      },
      ...rs,
    ])
    setInput('')
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-base text-ink">
          Dominio Propio
        </h1>
        <p className="text-muted">
          Conectá tu dominio para servir tu web con SSL automático.
        </p>
      </div>

      {/* Add domain */}
      <form
        onSubmit={add}
        className="mb-6 flex flex-wrap gap-3 rounded-lg border border-line bg-surface p-5 shadow-card"
      >
        <div className="relative min-w-0 flex-1">
          <Globe className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="www.tu-inmobiliaria.com"
            className="w-full rounded-md border border-line bg-surface py-2.5 pl-10 pr-4 text-sm text-ink placeholder:text-muted focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
          />
        </div>
        <Button type="submit">
          <Plus className="h-4 w-4" />
          Agregar dominio
        </Button>
      </form>

      {/* DNS instructions */}
      <div className="mb-6 rounded-lg border border-line bg-canvas p-5 text-sm">
        <p className="font-medium text-ink">Instrucciones DNS</p>
        <p className="mt-1 text-muted">
          En tu proveedor de dominio, creá un registro <strong>CNAME</strong> apuntando a:
        </p>
        <code className="mt-2 inline-block rounded bg-surface px-3 py-1.5 font-mono text-brand-dark">
          cname.inmohub.com
        </code>
        <p className="mt-2 text-muted">
          La verificación es automática (puede tardar hasta 24h). Al verificarse,
          el SSL se emite solo.
        </p>
      </div>

      {/* Domain list */}
      <div className="space-y-3">
        {rows.map((d) => {
          const Icon = statusIcon[d.status]
          return (
            <div
              key={d.id}
              className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-surface p-4 shadow-card"
            >
              <Globe className="h-5 w-5 text-muted" />
              <div className="min-w-0">
                <p className="truncate font-medium text-ink">{d.domain}</p>
                <p className="text-xs text-muted">→ {d.dnsTarget}</p>
              </div>
              <div className="ml-auto flex items-center gap-3">
                <Badge tone={statusTone[d.status]}>
                  <Icon className={`h-3.5 w-3.5 ${d.status === 'verifying' ? 'animate-spin' : ''}`} />
                  {domainStatusLabels[d.status]}
                </Badge>
                <button
                  onClick={() => setRows((rs) => rs.filter((r) => r.id !== d.id))}
                  className="rounded-md p-2 text-muted hover:bg-red-50 hover:text-red-600"
                  aria-label="Eliminar"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
