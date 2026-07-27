import type { ReactNode } from 'react'
import { AlertTriangle, Loader2 } from 'lucide-react'
import type { ApiError } from '../../lib/apiError'
import Button from './Button'

export function Spinner({ label = 'Cargando…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-12 text-muted">
      <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
      <span className="text-sm">{label}</span>
    </div>
  )
}

interface ErrorProps {
  error: ApiError
  onRetry?: () => void
}

export function ErrorState({ error, onRetry }: ErrorProps) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-line bg-surface px-6 py-12 text-center">
      <AlertTriangle className="h-8 w-8 text-accent" aria-hidden />
      <p className="text-ink">{error.message}</p>
      {error.issues.length > 0 && (
        <ul className="text-sm text-muted">
          {error.issues.map((i) => (
            <li key={`${i.path}-${i.message}`}>
              {i.path}: {i.message}
            </li>
          ))}
        </ul>
      )}
      {onRetry && (
        <Button variant="secondary" onClick={onRetry} className="mt-1">
          Reintentar
        </Button>
      )}
    </div>
  )
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-line bg-surface px-6 py-12 text-center text-muted">
      {children}
    </div>
  )
}
