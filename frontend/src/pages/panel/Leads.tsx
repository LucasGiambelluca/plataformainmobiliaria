import { useState } from 'react'
import { Mail, Phone } from 'lucide-react'
import Badge from '../../components/common/Badge'
import {
  leads as seed,
  leadStatusLabels,
  type Lead,
} from '../../data/panelMock'

const toneByStatus = {
  new: 'accent',
  contacted: 'brand',
  closed: 'neutral',
} as const

const filters: { key: Lead['status'] | 'all'; label: string }[] = [
  { key: 'all', label: 'Todos' },
  { key: 'new', label: 'Nuevos' },
  { key: 'contacted', label: 'Contactados' },
  { key: 'closed', label: 'Cerrados' },
]

const nextStatus: Record<Lead['status'], Lead['status']> = {
  new: 'contacted',
  contacted: 'closed',
  closed: 'new',
}

export default function Leads() {
  const [rows, setRows] = useState<Lead[]>(seed)
  const [filter, setFilter] = useState<Lead['status'] | 'all'>('all')

  const visible = filter === 'all' ? rows : rows.filter((r) => r.status === filter)

  const cycle = (id: string) =>
    setRows((rs) =>
      rs.map((r) => (r.id === id ? { ...r, status: nextStatus[r.status] } : r)),
    )

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-base text-ink">Leads</h1>
        <p className="text-muted">Consultas recibidas por tus propiedades.</p>
      </div>

      <div className="mb-5 flex flex-wrap gap-2">
        {filters.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded-pill border px-4 py-1.5 text-sm font-medium transition-colors ${
              filter === f.key
                ? 'border-brand bg-brand text-white'
                : 'border-line bg-surface text-ink hover:border-brand'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {visible.map((l) => (
          <div
            key={l.id}
            className="rounded-lg border border-line bg-surface p-5 shadow-card"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-ink">{l.name}</h3>
                  <Badge tone={toneByStatus[l.status]}>
                    {leadStatusLabels[l.status]}
                  </Badge>
                </div>
                <p className="mt-1 text-sm text-muted">{l.property}</p>
              </div>
              <span className="text-xs text-muted">{l.date}</span>
            </div>

            <p className="mt-3 text-sm text-ink">{l.message}</p>

            <div className="mt-4 flex flex-wrap items-center gap-4 border-t border-line pt-3 text-sm">
              <a href={`mailto:${l.email}`} className="flex items-center gap-1.5 text-muted hover:text-brand">
                <Mail className="h-4 w-4" />
                {l.email}
              </a>
              <a href={`tel:${l.phone}`} className="flex items-center gap-1.5 text-muted hover:text-brand">
                <Phone className="h-4 w-4" />
                {l.phone}
              </a>
              <button
                onClick={() => cycle(l.id)}
                className="ml-auto rounded-pill border border-line px-4 py-1.5 text-xs font-medium text-ink transition-colors hover:border-brand hover:text-brand"
              >
                Marcar como {leadStatusLabels[nextStatus[l.status]].toLowerCase()}
              </button>
            </div>
          </div>
        ))}
        {visible.length === 0 && (
          <p className="rounded-lg border border-line bg-surface p-8 text-center text-muted">
            No hay leads en este estado.
          </p>
        )}
      </div>
    </div>
  )
}
