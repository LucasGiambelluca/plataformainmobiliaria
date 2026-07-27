import { useState } from 'react'
import {
  Building2,
  Images,
  Loader2,
  Pause,
  Pencil,
  Play,
  Plus,
  Search,
  Star,
  Trash2,
} from 'lucide-react'
import Button from '../../components/common/Button'
import Select from '../../components/common/Select'
import Badge from '../../components/common/Badge'
import Modal from '../../components/common/Modal'
import { EmptyState, ErrorState, Spinner } from '../../components/common/AsyncState'
import PropertyForm from '../../components/properties/PropertyForm'
import MediaUploader from '../../components/properties/MediaUploader'
import { formatPrice, operationLabels, typeLabels } from '../../lib/propertyLabels'
import { useResource } from '../../hooks/useResource'
import { useDebounced } from '../../hooks/useDebounced'
import {
  changePropertyStatus,
  deleteProperty,
  getProperty,
  listProperties,
} from '../../api/properties'
import type {
  PropertyDetail,
  PropertyListItem,
  PropertyStatus,
} from '../../api/schemas'
import { ApiError } from '../../lib/apiError'

const PAGE_SIZE = 20

const statusLabels: Record<PropertyStatus, string> = {
  draft: 'Borrador',
  published: 'Publicada',
  paused: 'Pausada',
  featured: 'Destacada',
}

const statusTone: Record<PropertyStatus, 'neutral' | 'success' | 'warning' | 'accent'> = {
  draft: 'neutral',
  published: 'success',
  paused: 'warning',
  featured: 'accent',
}

const statusOptions = [
  { value: 'all', label: 'Todos los estados' },
  ...Object.entries(statusLabels).map(([value, label]) => ({ value, label })),
]

const sortOptions = [
  { value: 'recent', label: 'Más recientes' },
  { value: 'price_desc', label: 'Precio: mayor a menor' },
  { value: 'price_asc', label: 'Precio: menor a mayor' },
  { value: 'views', label: 'Más vistas' },
]

/**
 * Siguiente acción de publicación según el estado actual, siguiendo las
 * transiciones que admite el backend (un borrador no salta a destacada).
 */
function accionPublicar(status: PropertyStatus) {
  switch (status) {
    case 'draft':
      return { to: 'published' as const, label: 'Publicar', Icon: Play }
    case 'published':
      return { to: 'paused' as const, label: 'Pausar', Icon: Pause }
    case 'paused':
      return { to: 'published' as const, label: 'Volver a publicar', Icon: Play }
    case 'featured':
      return { to: 'published' as const, label: 'Quitar de destacadas', Icon: Star }
  }
}

type Dialogo =
  | { tipo: 'nueva' }
  | { tipo: 'editar'; property: PropertyDetail }
  | { tipo: 'fotos'; property: PropertyListItem }
  | { tipo: 'borrar'; property: PropertyListItem }
  | null

export default function Properties() {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [sort, setSort] = useState('recent')
  const [page, setPage] = useState(1)
  const [dialogo, setDialogo] = useState<Dialogo>(null)
  const [ocupadoId, setOcupadoId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const debounced = useDebounced(search)

  const propiedades = useResource(
    () =>
      listProperties({
        search: debounced || undefined,
        status: status === 'all' ? undefined : (status as PropertyStatus),
        sort: sort as 'recent',
        page,
        pageSize: PAGE_SIZE,
      }),
    [debounced, status, sort, page],
  )

  const recargar = propiedades.reload

  const cambiarEstado = async (p: PropertyListItem, to: PropertyStatus) => {
    setActionError(null)
    setOcupadoId(p.id)
    try {
      await changePropertyStatus(p.id, to)
      recargar()
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'No se pudo cambiar el estado')
    } finally {
      setOcupadoId(null)
    }
  }

  const abrirEdicion = async (p: PropertyListItem) => {
    setActionError(null)
    setOcupadoId(p.id)
    try {
      // El listado no trae características ni multimedia: se pide el detalle.
      setDialogo({ tipo: 'editar', property: await getProperty(p.id) })
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'No se pudo abrir')
    } finally {
      setOcupadoId(null)
    }
  }

  const confirmarBorrado = async (p: PropertyListItem) => {
    setActionError(null)
    setOcupadoId(p.id)
    try {
      await deleteProperty(p.id)
      setDialogo(null)
      recargar()
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'No se pudo eliminar')
    } finally {
      setOcupadoId(null)
    }
  }

  const total = propiedades.data?.total ?? 0
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-base text-ink">Propiedades</h1>
          <p className="text-muted">
            {propiedades.loading && !propiedades.data
              ? 'Cargando…'
              : `${total} en tu cartera.`}
          </p>
        </div>
        <Button onClick={() => setDialogo({ tipo: 'nueva' })}>
          <Plus className="h-4 w-4" />
          Nueva propiedad
        </Button>
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
            placeholder="Buscar por título, dirección o ciudad"
            className="w-full rounded-md border border-line bg-surface py-2.5 pl-10 pr-4 text-sm text-ink placeholder:text-muted focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
          />
        </div>
        <div className="w-44">
          <Select
            options={statusOptions}
            value={status}
            onChange={(e) => {
              setStatus(e.target.value)
              setPage(1)
            }}
          />
        </div>
        <div className="w-52">
          <Select options={sortOptions} value={sort} onChange={(e) => setSort(e.target.value)} />
        </div>
      </div>

      {actionError && (
        <p role="alert" className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {actionError}
        </p>
      )}

      {propiedades.error ? (
        <ErrorState error={propiedades.error} onRetry={recargar} />
      ) : propiedades.loading && !propiedades.data ? (
        <Spinner label="Cargando propiedades…" />
      ) : propiedades.data && propiedades.data.items.length === 0 ? (
        <EmptyState>
          {debounced || status !== 'all'
            ? 'Ninguna propiedad coincide con el filtro.'
            : 'Todavía no cargaste ninguna propiedad. Empezá por la primera.'}
        </EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line bg-surface shadow-card">
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
              {propiedades.data?.items.map((p) => {
                const accion = accionPublicar(p.status)
                const ocupado = ocupadoId === p.id
                return (
                  <tr key={p.id} className="hover:bg-canvas/60">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {p.coverUrl ? (
                          <img
                            src={p.coverUrl}
                            alt=""
                            className="h-10 w-14 shrink-0 rounded object-cover"
                          />
                        ) : (
                          <span className="grid h-10 w-14 shrink-0 place-items-center rounded bg-canvas text-muted">
                            <Building2 className="h-4 w-4" />
                          </span>
                        )}
                        <div className="min-w-0">
                          <p className="truncate font-medium text-ink">{p.title}</p>
                          <p className="text-xs text-muted">
                            {p.city ?? 'Sin ciudad'} · {p.mediaCount} foto
                            {p.mediaCount === 1 ? '' : 's'}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="hidden px-4 py-3 text-muted md:table-cell">
                      {operationLabels[p.operationType]}
                    </td>
                    <td className="hidden px-4 py-3 text-muted lg:table-cell">
                      {typeLabels[p.propertyType]}
                    </td>
                    <td className="px-4 py-3 font-medium text-ink">
                      {formatPrice(p.price, p.currency)}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={statusTone[p.status]}>{statusLabels[p.status]}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <button
                          onClick={() => setDialogo({ tipo: 'fotos', property: p })}
                          className="rounded-md p-2 text-muted hover:bg-brand/10 hover:text-brand"
                          aria-label={`Fotos de ${p.title}`}
                          title="Fotos"
                        >
                          <Images className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => void cambiarEstado(p, accion.to)}
                          disabled={ocupado}
                          className="rounded-md p-2 text-muted hover:bg-brand/10 hover:text-brand disabled:opacity-40"
                          aria-label={`${accion.label}: ${p.title}`}
                          title={accion.label}
                        >
                          {ocupado ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <accion.Icon className="h-4 w-4" />
                          )}
                        </button>
                        {p.status === 'published' && (
                          <button
                            onClick={() => void cambiarEstado(p, 'featured')}
                            disabled={ocupado}
                            className="rounded-md p-2 text-muted hover:bg-accent/10 hover:text-accent disabled:opacity-40"
                            aria-label={`Destacar ${p.title}`}
                            title="Destacar"
                          >
                            <Star className="h-4 w-4" />
                          </button>
                        )}
                        <button
                          onClick={() => void abrirEdicion(p)}
                          disabled={ocupado}
                          className="rounded-md p-2 text-muted hover:bg-brand/10 hover:text-brand disabled:opacity-40"
                          aria-label={`Editar ${p.title}`}
                          title="Editar"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setDialogo({ tipo: 'borrar', property: p })}
                          className="rounded-md p-2 text-muted hover:bg-red-50 hover:text-red-600"
                          aria-label={`Eliminar ${p.title}`}
                          title="Eliminar"
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
              disabled={page <= 1 || propiedades.loading}
              onClick={() => setPage((p) => p - 1)}
            >
              Anterior
            </Button>
            <Button
              variant="secondary"
              disabled={page >= pages || propiedades.loading}
              onClick={() => setPage((p) => p + 1)}
            >
              Siguiente
            </Button>
          </div>
        </div>
      )}

      {(dialogo?.tipo === 'nueva' || dialogo?.tipo === 'editar') && (
        <Modal
          open
          onClose={() => setDialogo(null)}
          title={dialogo.tipo === 'nueva' ? 'Nueva propiedad' : 'Editar propiedad'}
          // El formulario es largo: un click al costado no puede tirar la carga.
          dismissOnBackdrop={false}
        >
          <PropertyForm
            property={dialogo.tipo === 'editar' ? dialogo.property : undefined}
            onCancel={() => setDialogo(null)}
            onSaved={(guardada) => {
              recargar()
              // Recién creada: se encadena con las fotos, que es lo que sigue.
              if (dialogo.tipo === 'nueva') {
                setDialogo({
                  tipo: 'fotos',
                  property: { ...guardada, coverUrl: null, mediaCount: 0 },
                })
              } else {
                setDialogo(null)
              }
            }}
          />
        </Modal>
      )}

      {dialogo?.tipo === 'fotos' && (
        <Modal
          open
          onClose={() => {
            setDialogo(null)
            recargar()
          }}
          title={`Fotos · ${dialogo.property.title}`}
          // Puede haber una subida en curso.
          dismissOnBackdrop={false}
        >
          <MediaUploader propertyId={dialogo.property.id} />
        </Modal>
      )}

      {dialogo?.tipo === 'borrar' && (
        <Modal open onClose={() => setDialogo(null)} title="Eliminar propiedad">
          <p className="text-ink">
            ¿Seguro que querés eliminar <strong>{dialogo.property.title}</strong>?
          </p>
          <p className="mt-2 text-sm text-muted">
            Se borran también sus {dialogo.property.mediaCount} foto
            {dialogo.property.mediaCount === 1 ? '' : 's'}. No se puede deshacer.
          </p>
          <div className="mt-5 flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setDialogo(null)}>
              Cancelar
            </Button>
            <Button
              className="bg-red-600 hover:bg-red-700"
              disabled={ocupadoId === dialogo.property.id}
              onClick={() => void confirmarBorrado(dialogo.property)}
            >
              {ocupadoId === dialogo.property.id && (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              )}
              Eliminar
            </Button>
          </div>
        </Modal>
      )}
    </div>
  )
}
