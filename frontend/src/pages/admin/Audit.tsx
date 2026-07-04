import { useState } from 'react'
import { Search } from 'lucide-react'
import Select from '../../components/common/Select'
import Badge from '../../components/common/Badge'
import { auditLogs } from '../../data/adminMock'

const actionTone = (action: string) => {
  if (action.includes('delete') || action.includes('suspend')) return 'danger'
  if (action.includes('create')) return 'success'
  if (action.includes('login')) return 'brand'
  return 'neutral'
}

export default function Audit() {
  const [q, setQ] = useState('')
  const [action, setAction] = useState('all')

  const actions = Array.from(new Set(auditLogs.map((l) => l.action)))
  const actionOptions = [
    { value: 'all', label: 'Todas las acciones' },
    ...actions.map((a) => ({ value: a, label: a })),
  ]

  const filtered = auditLogs.filter(
    (l) =>
      (action === 'all' || l.action === action) &&
      `${l.user} ${l.tenant} ${l.entity}`.toLowerCase().includes(q.toLowerCase()),
  )

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-base text-ink">Auditoría</h1>
        <p className="text-muted">Registro de acciones en la plataforma.</p>
      </div>

      <div className="mb-4 flex flex-wrap gap-3">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar usuario, inmobiliaria o entidad"
            className="w-full rounded-md border border-line bg-surface py-2.5 pl-10 pr-4 text-sm text-ink placeholder:text-muted focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
          />
        </div>
        <div className="w-56">
          <Select options={actionOptions} value={action} onChange={(e) => setAction(e.target.value)} />
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-line bg-surface shadow-card">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line bg-canvas text-xs uppercase tracking-base text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Fecha</th>
              <th className="px-4 py-3 font-medium">Usuario</th>
              <th className="hidden px-4 py-3 font-medium md:table-cell">Inmobiliaria</th>
              <th className="px-4 py-3 font-medium">Acción</th>
              <th className="px-4 py-3 font-medium">Entidad</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {filtered.map((l) => (
              <tr key={l.id} className="hover:bg-canvas/60">
                <td className="whitespace-nowrap px-4 py-3 text-muted">{l.date}</td>
                <td className="px-4 py-3 font-medium text-ink">{l.user}</td>
                <td className="hidden px-4 py-3 text-muted md:table-cell">{l.tenant}</td>
                <td className="px-4 py-3">
                  <Badge tone={actionTone(l.action)}>{l.action}</Badge>
                </td>
                <td className="px-4 py-3 text-muted">{l.entity}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <p className="p-8 text-center text-muted">Sin resultados.</p>}
      </div>
    </div>
  )
}
