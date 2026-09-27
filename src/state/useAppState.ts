import { useCallback, useEffect, useRef, useState } from 'react'
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

  // What storage last handed us. Writing it back would gain nothing and could overwrite a newer
  // save from another window, so only states she changed are saved.
  const loaded = useRef<AppState | null>(null)

  /** Reads the saved state again — after taking over from another window that kept editing. */
  const reload = useCallback(() => {
    loadState().then(
      (next) => {
        loaded.current = next
        setState(next)
      },
      () => {
        setStorageError(true)
        setState(null)
      },
    )
  }, [])

  useEffect(() => {
    reload()
    void requestPersistence().then(setPersisted)
  }, [reload])

  useEffect(() => {
    if (state && state !== loaded.current) saveState(state).catch(() => setStorageError(true))
  }, [state])

  const dispatch = useCallback((action: Action) => {
    setState((current) => (current ? reducer(current, action) : current))
  }, [])

  const replace = useCallback((next: AppState | null) => {
    if (next === null) void clearState()
    setState(next)
  }, [])

  return { state, dispatch, replace, reload, persisted, storageError }
}
