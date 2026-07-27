import { forwardRef, type InputHTMLAttributes } from 'react'

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  /** Mensaje de validación bajo el campo. */
  error?: string
}

const field =
  'w-full rounded-md border bg-surface px-4 py-2.5 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-1'
const normal = 'border-line focus:border-brand focus:ring-brand'
const invalid = 'border-red-500 focus:border-red-500 focus:ring-red-500'

// forwardRef: react-hook-form necesita la ref del input nativo para registrarlo.
const Input = forwardRef<HTMLInputElement, Props>(function Input(
  { label, error, className = '', ...rest },
  ref,
) {
  return (
    <label className="block">
      {label && (
        <span className="mb-1.5 block text-sm font-medium text-ink">{label}</span>
      )}
      <input
        ref={ref}
        aria-invalid={error ? true : undefined}
        className={`${field} ${error ? invalid : normal} ${className}`}
        {...rest}
      />
      {error && <span className="mt-1 block text-xs text-red-600">{error}</span>}
    </label>
  )
})

export default Input
