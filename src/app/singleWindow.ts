import { useCallback, useEffect, useRef, useState } from 'react'

export type WindowStatus = 'checking' | 'active' | 'elsewhere'

const LOCK = 'ovoda-beosztas-window'

/**
 * Only one window edits at a time. The whole state is saved under one key, so two open windows
 * would silently overwrite each other. The window holding this lock edits; any other one is told
 * so and may take over, which stops the first. Browsers without Web Locks carry on as before.
 */
export function useSingleWindow(locks: LockManager | undefined = globalThis.navigator?.locks) {
  const [status, setStatus] = useState<WindowStatus>(locks ? 'checking' : 'active')
  const requested = useRef(false) // StrictMode runs effects twice; ask for the lock once

  const acquire = useCallback(
    (steal: boolean) => {
      if (!locks) return
      locks
        .request(LOCK, steal ? { steal: true } : { ifAvailable: true }, (lock) => {
          if (!lock) {
            setStatus('elsewhere')
            return
          }
          setStatus('active')
          return new Promise<void>(() => {}) // held for as long as this window is open
        })
        .catch(() => setStatus('elsewhere')) // another window took over
    },
    [locks],
  )

  useEffect(() => {
    if (requested.current) return
    requested.current = true
    acquire(false)
  }, [acquire])

  const takeOver = useCallback(() => acquire(true), [acquire])
  return { status, takeOver }
}
