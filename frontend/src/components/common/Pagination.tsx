import Button from './Button'

interface Props {
  page: number
  pageSize: number
  total: number
  /** Deshabilita los botones mientras llega la página pedida. */
  loading?: boolean
  onChange: (page: number) => void
}

/**
 * Anterior / Siguiente con "Página N de M". No se dibuja si entra todo en una
 * página. Las pantallas del panel tienen la misma barra escrita a mano; esta
 * es la de las pantallas públicas.
 */
export default function Pagination({ page, pageSize, total, loading, onChange }: Props) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  if (pages <= 1) return null

  return (
    <nav
      aria-label="Paginación"
      className="mt-8 flex items-center justify-between text-sm text-muted"
    >
      <span>
        Página {page} de {pages}
      </span>
      <div className="flex gap-2">
        <Button variant="secondary" disabled={page <= 1 || loading} onClick={() => onChange(page - 1)}>
          Anterior
        </Button>
        <Button
          variant="secondary"
          disabled={page >= pages || loading}
          onClick={() => onChange(page + 1)}
        >
          Siguiente
        </Button>
      </div>
    </nav>
  )
}
