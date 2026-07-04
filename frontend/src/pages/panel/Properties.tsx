import { useState } from 'react'
import { Pencil, Plus, Search, Trash2 } from 'lucide-react'
import Button from '../../components/common/Button'
import Input from '../../components/common/Input'
import Select from '../../components/common/Select'
import Badge from '../../components/common/Badge'
import Modal from '../../components/common/Modal'
import {
  formatPrice,
  operationLabels,
  properties as seed,
  typeLabels,
} from '../../data/mock'
import type { Property } from '../../types'

type Status = 'draft' | 'published' | 'paused' | 'featured'

interface Row extends Property {
  status: Status
}

const statusLabels: Record<Status, string> = {
  draft: 'Borrador',
  published: 'Publicada',
  paused: 'Pausada',
  featured: 'Destacada',
}

const statusTone: Record<Status, 'neutral' | 'success' | 'warning' | 'accent'> = {
  draft: 'neutral',
  published: 'success',
  paused: 'warning',
  featured: 'accent',
}

const initial: Row[] = seed.map((p, i) => ({
  ...p,
  status: (['published', 'featured', 'paused', 'draft'] as Status[])[i % 4],
}))

const typeOptions = Object.entries(typeLabels).map(([value, label]) => ({ value, label }))
const opOptions = Object.entries(operationLabels).map(([value, label]) => ({ value, label }))

export default function Properties() {
  const [rows, setRows] = useState<Row[]>(initial)
  const [q, setQ] = useState('')
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState<Row | null>(null)

  const filtered = rows.filter((r) =>
    `${r.title} ${r.city}`.toLowerCase().includes(q.toLowerCase()),
  )

  const openNew = () => {
    setEditing(null)
    setModal(true)
  }
  const openEdit = (r: Row) => {
    setEditing(r)
    setModal(true)
  }
  const remove = (id: string) => setRows((rs) => rs.filter((r) => r.id !== id))

  const save = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const data = {
      title: String(f.get('title')),
      city: String(f.get('city')),
      address: String(f.get('address')),
      operation: f.get('operation') as Property['operation'],
      type: f.get('type') as Property['type'],
      price: Number(f.get('price')),
      status: f.get('status') as Status,
    }
    if (editing) {
      setRows((rs) =>
        rs.map((r) => (r.id === editing.id ? { ...r, ...data } : r)),
      )
    } else {
      setRows((rs) => [
        {
          ...seed[0],
          ...data,
          id: String(Date.now()),
          currency: 'ARS',
          rooms: 2,
          bathrooms: 1,
          area: 60,
          agency: 'Inmobiliaria Norte',
        },
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
            Propiedades
          </h1>
          <p className="text-muted">{rows.length} en tu cartera.</p>
        </div>
        <Button onClick={openNew}>
          <Plus className="h-4 w-4" />
          Nueva propiedad
        </Button>
      </div>

      <div className="mb-4 max-w-sm">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por título o ciudad"
            className="w-full rounded-md border border-line bg-surface py-2.5 pl-10 pr-4 text-sm text-ink placeholder:text-muted focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-line bg-surface shadow-card">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line bg-canvas text-xs uppercase tracking-base text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Propiedad</th>
              <th className="hidden px-4 py-3 font-medium md:table-cell">Operación</th>
              <th className="hidden px-4 py-3 font-medium lg:table-cell">Tipo</th>
              <th className="px-4 py-3 font-medium">Precio</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3 text-right font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {filtered.map((r) => (
              <tr key={r.id} className="hover:bg-canvas/60">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <img src={r.image} alt="" className="h-10 w-14 rounded object-cover" />
                    <div className="min-w-0">
                      <p className="truncate font-medium text-ink">{r.title}</p>
                      <p className="text-xs text-muted">{r.city}</p>
                    </div>
                  </div>
                </td>
                <td className="hidden px-4 py-3 text-muted md:table-cell">
                  {operationLabels[r.operation]}
                </td>
                <td className="hidden px-4 py-3 text-muted lg:table-cell">
                  {typeLabels[r.type]}
                </td>
                <td className="px-4 py-3 font-medium text-ink">{formatPrice(r)}</td>
                <td className="px-4 py-3">
                  <Badge tone={statusTone[r.status]}>{statusLabels[r.status]}</Badge>
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-1">
                    <button
                      onClick={() => openEdit(r)}
                      className="rounded-md p-2 text-muted hover:bg-brand/10 hover:text-brand"
                      aria-label="Editar"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => remove(r.id)}
                      className="rounded-md p-2 text-muted hover:bg-red-50 hover:text-red-600"
                      aria-label="Eliminar"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <p className="p-8 text-center text-muted">Sin resultados.</p>
        )}
      </div>

      <Modal
        open={modal}
        onClose={() => setModal(false)}
        title={editing ? 'Editar propiedad' : 'Nueva propiedad'}
      >
        <form id="prop-form" onSubmit={save} className="space-y-4">
          <Input name="title" label="Título" defaultValue={editing?.title} required />
          <div className="grid grid-cols-2 gap-3">
            <Input name="city" label="Ciudad" defaultValue={editing?.city} required />
            <Input name="address" label="Dirección" defaultValue={editing?.address} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Select
              name="operation"
              label="Operación"
              options={opOptions}
              defaultValue={editing?.operation ?? 'venta'}
            />
            <Select
              name="type"
              label="Tipo"
              options={typeOptions}
              defaultValue={editing?.type ?? 'casa'}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input
              name="price"
              label="Precio (ARS)"
              type="number"
              defaultValue={editing?.price ?? 0}
              required
            />
            <Select
              name="status"
              label="Estado"
              options={Object.entries(statusLabels).map(([value, label]) => ({ value, label }))}
              defaultValue={editing?.status ?? 'draft'}
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={() => setModal(false)}>
              Cancelar
            </Button>
            <Button type="submit">{editing ? 'Guardar cambios' : 'Crear'}</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
