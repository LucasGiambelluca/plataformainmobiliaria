import { useState } from 'react'
import { CheckCircle2, Clock, Globe, Loader2, Search, XCircle } from 'lucide-react'
import Select from '../../components/common/Select'
import Badge from '../../components/common/Badge'
import Button from '../../components/common/Button'
import {
  globalDomains as seed,
  type GlobalDomain,
} from '../../data/adminMock'

const statusLabels: Record<GlobalDomain['status'], string> = {
  pending: 'Pendiente',
  verifying: 'Verificando',
  active: 'Activo',
  failed: 'Fallido',
}

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

const filterOptions = [
  { value: 'all', label: 'Todos los estados' },
  { value: 'active', label: 'Activos' },
  { value: 'verifying', label: 'Verificando' },
  { value: 'pending', label: 'Pendientes' },
  { value: 'failed', label: 'Fallidos' },
]

export default function AdminDomains() {
  const [rows, setRows] = useState<GlobalDomain[]>(seed)
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState('all')

  const filtered = rows.filter(
    (r) =>
      (filter === 'all' || r.status === filter) &&
      `${r.domain} ${r.tenant}`.toLowerCase().includes(q.toLowerCase()),
  )

  // Override manual: forzar a 'active' (acción de Super Admin).
  const forceActive = (id: string) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, status: 'active' } : r)))

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-base text-ink">Dominios</h1>
        <p className="text-muted">Dominios custom de todas las inmobiliarias.</p>
      </div>

      <div className="mb-4 flex flex-wrap gap-3">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar dominio o inmobiliaria"
            className="w-full rounded-md border border-line bg-surface py-2.5 pl-10 pr-4 text-sm text-ink placeholder:text-muted focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
          />
        </div>
        <div className="w-48">
          <Select options={filterOptions} value={filter} onChange={(e) => setFilter(e.target.value)} />
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-line bg-surface shadow-card">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line bg-canvas text-xs uppercase tracking-base text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Dominio</th>
              <th className="px-4 py-3 font-medium">Inmobiliaria</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3 text-right font-medium">Override</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {filtered.map((d) => {
              const Icon = statusIcon[d.status]
              return (
                <tr key={d.id} className="hover:bg-canvas/60">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Globe className="h-4 w-4 text-muted" />
                      <span className="font-medium text-ink">{d.domain}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted">{d.tenant}</td>
                  <td className="px-4 py-3">
                    <Badge tone={statusTone[d.status]}>
                      <Icon className={`h-3.5 w-3.5 ${d.status === 'verifying' ? 'animate-spin' : ''}`} />
                      {statusLabels[d.status]}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {d.status !== 'active' ? (
                      <Button variant="secondary" onClick={() => forceActive(d.id)}>
                        Forzar activo
                      </Button>
                    ) : (
                      <span className="text-xs text-muted">—</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {filtered.length === 0 && <p className="p-8 text-center text-muted">Sin resultados.</p>}
      </div>
    </div>
  )
}
