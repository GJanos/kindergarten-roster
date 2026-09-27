import { useCallback, useEffect, useState } from 'react'
import { reducer, type Action, type AppState } from './appState'
import { clearState, loadState, requestPersistence, saveState } from './storage'

/**
 * `state` is undefined while loading and null before the first start (or after
 * leaving the demo). Every change is saved to IndexedDB at once.
 */
export function useAppState() {
  const [state, setState] = useState<AppState | null | undefined>(undefined)
  const [persisted, setPersisted] = useState<boolean>()
  const [storageError, setStorageError] = useState(false)

  useEffect(() => {
    loadState().then(setState, () => {
      setStorageError(true)
      setState(null)
    })
    void requestPersistence().then(setPersisted)
  }, [])

  useEffect(() => {
    if (state) saveState(state).catch(() => setStorageError(true))
  }, [state])

  const dispatch = useCallback((action: Action) => {
    setState((current) => (current ? reducer(current, action) : current))
  }, [])

  const replace = useCallback((next: AppState | null) => {
    if (next === null) void clearState()
    setState(next)
  }, [])

  return { state, dispatch, replace, persisted, storageError }
}
