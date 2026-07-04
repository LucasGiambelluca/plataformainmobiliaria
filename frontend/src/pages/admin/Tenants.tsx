import { useState } from 'react'
import { Ban, Pencil, Play, Plus, Search } from 'lucide-react'
import Button from '../../components/common/Button'
import Input from '../../components/common/Input'
import Select from '../../components/common/Select'
import Badge from '../../components/common/Badge'
import Modal from '../../components/common/Modal'
import {
  plans,
  tenants as seed,
  tenantStatusLabels,
  tenantStatusTone,
  type Tenant,
} from '../../data/adminMock'

const statusOptions = [
  { value: 'all', label: 'Todos los estados' },
  { value: 'active', label: 'Activas' },
  { value: 'trialing', label: 'Trial' },
  { value: 'past_due', label: 'Pago vencido' },
  { value: 'suspended', label: 'Suspendidas' },
]

const planOptions = plans.map((p) => ({ value: p.name, label: p.name }))

export default function Tenants() {
  const [rows, setRows] = useState<Tenant[]>(seed)
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('all')
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState<Tenant | null>(null)

  const filtered = rows.filter(
    (r) =>
      (status === 'all' || r.status === status) &&
      `${r.name} ${r.slug}`.toLowerCase().includes(q.toLowerCase()),
  )

  const toggleSuspend = (id: string) =>
    setRows((rs) =>
      rs.map((r) =>
        r.id === id
          ? { ...r, status: r.status === 'suspended' ? 'active' : 'suspended' }
          : r,
      ),
    )

  const openNew = () => {
    setEditing(null)
    setModal(true)
  }
  const openEdit = (t: Tenant) => {
    setEditing(t)
    setModal(true)
  }

  const save = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const data = {
      name: String(f.get('name')),
      slug: String(f.get('slug')),
      plan: f.get('plan') as Tenant['plan'],
      status: f.get('status') as Tenant['status'],
    }
    if (editing) {
      setRows((rs) => rs.map((r) => (r.id === editing.id ? { ...r, ...data } : r)))
    } else {
      setRows((rs) => [
        { id: String(Date.now()), properties: 0, users: 1, joined: '2026-06-12', ...data },
        ...rs,
      ])
    }
    setModal(false)
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-base text-ink">
            Inmobiliarias
          </h1>
          <p className="text-muted">{rows.length} registradas.</p>
        </div>
        <Button onClick={openNew}>
          <Plus className="h-4 w-4" />
          Nueva inmobiliaria
        </Button>
      </div>

      <div className="mb-4 flex flex-wrap gap-3">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nombre o slug"
            className="w-full rounded-md border border-line bg-surface py-2.5 pl-10 pr-4 text-sm text-ink placeholder:text-muted focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
          />
        </div>
        <div className="w-48">
          <Select options={statusOptions} value={status} onChange={(e) => setStatus(e.target.value)} />
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-line bg-surface shadow-card">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line bg-canvas text-xs uppercase tracking-base text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Inmobiliaria</th>
              <th className="px-4 py-3 font-medium">Plan</th>
              <th className="hidden px-4 py-3 font-medium md:table-cell">Props</th>
              <th className="hidden px-4 py-3 font-medium lg:table-cell">Alta</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3 text-right font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {filtered.map((t) => (
              <tr key={t.id} className="hover:bg-canvas/60">
                <td className="px-4 py-3">
                  <p className="font-medium text-ink">{t.name}</p>
                  <p className="text-xs text-muted">/{t.slug}</p>
                </td>
                <td className="px-4 py-3">
                  <Badge tone="brand">{t.plan}</Badge>
                </td>
                <td className="hidden px-4 py-3 text-muted md:table-cell">{t.properties}</td>
                <td className="hidden px-4 py-3 text-muted lg:table-cell">{t.joined}</td>
                <td className="px-4 py-3">
                  <Badge tone={tenantStatusTone[t.status]}>{tenantStatusLabels[t.status]}</Badge>
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-1">
                    <button
                      onClick={() => openEdit(t)}
                      className="rounded-md p-2 text-muted hover:bg-brand/10 hover:text-brand"
                      aria-label="Editar"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => toggleSuspend(t.id)}
                      className={`rounded-md p-2 ${
                        t.status === 'suspended'
                          ? 'text-muted hover:bg-emerald-50 hover:text-emerald-600'
                          : 'text-muted hover:bg-red-50 hover:text-red-600'
                      }`}
                      aria-label={t.status === 'suspended' ? 'Reactivar' : 'Suspender'}
                    >
                      {t.status === 'suspended' ? (
                        <Play className="h-4 w-4" />
                      ) : (
                        <Ban className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <p className="p-8 text-center text-muted">Sin resultados.</p>}
      </div>

      <Modal
        open={modal}
        onClose={() => setModal(false)}
        title={editing ? 'Editar inmobiliaria' : 'Nueva inmobiliaria'}
      >
        <form onSubmit={save} className="space-y-4">
          <Input name="name" label="Nombre" defaultValue={editing?.name} required />
          <Input name="slug" label="Slug (subdominio)" defaultValue={editing?.slug} required />
          <div className="grid grid-cols-2 gap-3">
            <Select name="plan" label="Plan" options={planOptions} defaultValue={editing?.plan ?? 'Básico'} />
            <Select
              name="status"
              label="Estado"
              options={statusOptions.filter((o) => o.value !== 'all')}
              defaultValue={editing?.status ?? 'trialing'}
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={() => setModal(false)}>
              Cancelar
            </Button>
            <Button type="submit">{editing ? 'Guardar' : 'Crear'}</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
