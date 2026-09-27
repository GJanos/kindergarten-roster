import { del, get, set } from 'idb-keyval'
import type { AppState } from './appState'
import { migrate } from './migrate'

const KEY = 'ovoda-beosztas'

/** Null before the first start. The whole state lives under one key, so nothing is ever half-saved. */
export async function loadState(): Promise<AppState | null> {
  const raw = await get(KEY)
  return raw === undefined ? null : migrate(raw)
}

export function saveState(state: AppState): Promise<void> {
  return set(KEY, state)
}

export function clearState(): Promise<void> {
  return del(KEY)
}

/** Asks the browser not to evict the data. False: the footer asks for more frequent backups. */
export async function requestPersistence(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false
  } catch {
    return false
  }
}
