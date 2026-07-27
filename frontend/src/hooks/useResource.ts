import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, toApiError } from '../lib/apiError'

interface Resource<T> {
  data: T | null
  error: ApiError | null
  loading: boolean
  /** Vuelve a pedir los datos (por ejemplo después de un alta o edición). */
  reload: () => void
  /** Actualiza los datos en memoria sin ir al servidor. */
  setData: (updater: (current: T) => T) => void
}

/**
 * Fetch declarativo con estados de carga y error. Deliberadamente mínimo: no
 * cachea ni deduplica, alcanza para pantallas de panel. Si más adelante hace
 * falta caché compartida, el reemplazo natural es TanStack Query.
 *
 * `deps` funciona como el array de useEffect: cambia → vuelve a pedir.
 */
export function useResource<T>(fetcher: () => Promise<T>, deps: unknown[] = []): Resource<T> {
  const [data, setState] = useState<T | null>(null)
  const [error, setError] = useState<ApiError | null>(null)
  const [loading, setLoading] = useState(true)
  const [nonce, setNonce] = useState(0)

  // El fetcher suele ser una arrow nueva en cada render: se guarda en una ref
  // para que no dispare el efecto por sí solo.
  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    fetcherRef
      .current()
      .then((result) => {
        if (!cancelled) setState(result)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(toApiError(err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      // Evita pisar el estado con la respuesta de un pedido viejo.
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nonce, ...deps])

  const reload = useCallback(() => setNonce((n) => n + 1), [])

  const setData = useCallback((updater: (current: T) => T) => {
    setState((current) => (current === null ? current : updater(current)))
  }, [])

  return { data, error, loading, reload, setData }
}
