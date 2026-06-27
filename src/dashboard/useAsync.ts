import { useEffect, useState } from 'react'

interface AsyncState<T> {
  loading: boolean
  error: string | null
  data: T | null
}

/**
 * Run an async loader on mount / when deps change, exposing loading/error/data.
 * Ignores results after unmount. Keeps the dashboard pages free of repetitive
 * try/catch/loading boilerplate.
 */
export function useAsync<T>(loader: () => Promise<T>, deps: unknown[]): AsyncState<T> {
  const [state, setState] = useState<AsyncState<T>>({ loading: true, error: null, data: null })

  useEffect(() => {
    let cancelled = false
    setState({ loading: true, error: null, data: null })
    loader()
      .then((data) => { if (!cancelled) setState({ loading: false, error: null, data }) })
      .catch((err: unknown) => {
        if (!cancelled) setState({ loading: false, error: err instanceof Error ? err.message : String(err), data: null })
      })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return state
}
