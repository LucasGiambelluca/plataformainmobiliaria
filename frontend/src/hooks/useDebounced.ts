import { useEffect, useState } from 'react'

/** Devuelve `value` recién después de `delay` ms sin cambios (para búsquedas). */
export function useDebounced<T>(value: T, delay = 350): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(id)
  }, [value, delay])

  return debounced
}
