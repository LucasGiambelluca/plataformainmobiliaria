import { forwardRef, type SelectHTMLAttributes } from 'react'
import { ChevronDown } from 'lucide-react'

interface Props extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  options: { value: string; label: string }[]
  placeholder?: string
  /** Mensaje de validación bajo el campo. */
  error?: string
}

const field =
  'w-full appearance-none rounded-md border bg-surface px-4 py-2.5 pr-10 text-sm text-ink focus:outline-none focus:ring-1'
const normal = 'border-line focus:border-brand focus:ring-brand'
const invalid = 'border-red-500 focus:border-red-500 focus:ring-red-500'

// forwardRef: react-hook-form necesita la ref del select nativo.
const Select = forwardRef<HTMLSelectElement, Props>(function Select(
  { label, options, placeholder, error, className = '', ...rest },
  ref,
) {
  return (
    <label className="block">
      {label && (
        <span className="mb-1.5 block text-sm font-medium text-ink">{label}</span>
      )}
      <div className="relative">
        <select
          ref={ref}
          aria-invalid={error ? true : undefined}
          className={`${field} ${error ? invalid : normal} ${className}`}
          {...rest}
        >
          {placeholder && <option value="">{placeholder}</option>}
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
      </div>
      {error && <span className="mt-1 block text-xs text-red-600">{error}</span>}
    </label>
  )
})

export default Select
