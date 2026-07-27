import type { ReactNode } from 'react'
import { X } from 'lucide-react'

interface Props {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  footer?: ReactNode
  /**
   * Cerrar tocando el fondo. Conviene desactivarlo cuando adentro hay un
   * formulario largo o una subida en curso: un click al costado no debería
   * hacer perder lo cargado.
   */
  dismissOnBackdrop?: boolean
}

export default function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  dismissOnBackdrop = true,
}: Props) {
  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 py-10"
      onClick={dismissOnBackdrop ? onClose : undefined}
    >
      <div
        className="w-full max-w-lg rounded-xl bg-surface shadow-card-hover"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <h2 className="text-lg font-semibold tracking-base text-ink">{title}</h2>
          <button onClick={onClose} aria-label="Cerrar" className="text-muted hover:text-ink">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
        {footer && (
          <div className="flex justify-end gap-3 border-t border-line px-6 py-4">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
