import { useState } from 'react'
import { Pencil, Plus, Trash2, Users, Building2, HardDrive } from 'lucide-react'
import Button from '../../components/common/Button'
import Input from '../../components/common/Input'
import Badge from '../../components/common/Badge'
import Modal from '../../components/common/Modal'
import { plans as seed, type Plan } from '../../data/adminMock'
import { formatARS } from '../../data/mock'

export default function Plans() {
  const [rows, setRows] = useState<Plan[]>(seed)
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState<Plan | null>(null)

  const openNew = () => {
    setEditing(null)
    setModal(true)
  }
  const openEdit = (p: Plan) => {
    setEditing(p)
    setModal(true)
  }
  const remove = (id: string) => setRows((rs) => rs.filter((r) => r.id !== id))

  const save = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const data = {
      name: String(f.get('name')),
      price: Number(f.get('price')),
      maxProperties: Number(f.get('maxProperties')),
      maxUsers: Number(f.get('maxUsers')),
      maxStorageGb: Number(f.get('maxStorageGb')),
    }
    if (editing) {
      setRows((rs) => rs.map((r) => (r.id === editing.id ? { ...r, ...data } : r)))
    } else {
      setRows((rs) => [
        ...rs,
        { id: String(Date.now()), interval: 'mes', active: true, tenants: 0, ...data },
      ])
    }
    setModal(false)
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-base text-ink">Planes</h1>
          <p className="text-muted">Catálogo de suscripciones.</p>
        </div>
        <Button onClick={openNew}>
          <Plus className="h-4 w-4" />
          Nuevo plan
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {rows.map((p) => (
          <div key={p.id} className="rounded-xl border border-line bg-surface p-6 shadow-card">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold tracking-base text-ink">{p.name}</h3>
              <Badge tone={p.active ? 'success' : 'neutral'}>
                {p.active ? 'Activo' : 'Inactivo'}
              </Badge>
            </div>
            <p className="mt-2 text-2xl font-bold tracking-base text-ink">
              {formatARS(p.price)}
              <span className="text-sm font-normal text-muted"> / {p.interval}</span>
            </p>
            <p className="mt-1 text-xs text-muted">{p.tenants} inmobiliarias usan este plan</p>

            <ul className="mt-4 space-y-2 text-sm text-ink">
              <li className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-brand" />
                {p.maxProperties >= 9999 ? 'Propiedades ilimitadas' : `${p.maxProperties} propiedades`}
              </li>
              <li className="flex items-center gap-2">
                <Users className="h-4 w-4 text-brand" />
                {p.maxUsers >= 9999 ? 'Agentes ilimitados' : `${p.maxUsers} agentes`}
              </li>
              <li className="flex items-center gap-2">
                <HardDrive className="h-4 w-4 text-brand" />
                {p.maxStorageGb} GB de almacenamiento
              </li>
            </ul>

            <div className="mt-5 flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={() => openEdit(p)}>
                <Pencil className="h-4 w-4" />
                Editar
              </Button>
              <button
                onClick={() => remove(p.id)}
                className="rounded-pill border border-line p-2.5 text-muted hover:bg-red-50 hover:text-red-600"
                aria-label="Eliminar"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Editar plan' : 'Nuevo plan'}>
        <form onSubmit={save} className="space-y-4">
          <Input name="name" label="Nombre" defaultValue={editing?.name} required />
          <Input name="price" label="Precio (ARS / mes)" type="number" defaultValue={editing?.price ?? 0} required />
          <div className="grid grid-cols-3 gap-3">
            <Input name="maxProperties" label="Máx. props" type="number" defaultValue={editing?.maxProperties ?? 30} />
            <Input name="maxUsers" label="Máx. usuarios" type="number" defaultValue={editing?.maxUsers ?? 2} />
            <Input name="maxStorageGb" label="GB" type="number" defaultValue={editing?.maxStorageGb ?? 5} />
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
