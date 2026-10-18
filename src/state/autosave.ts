import { del, get, set } from 'idb-keyval'
import type { AppState } from './appState'
import { backupFileName, backupJson } from './backup'

/**
 * Autosave to a folder she picks (2026-10-18): the day's backup file, written for her. Chrome and
 * Edge only (File System Access API). The folder and the interval stay on this device, under their
 * own key: a restore never changes where this laptop saves.
 */

export type Permission = 'granted' | 'denied' | 'prompt'

/** The parts of FileSystemDirectoryHandle autosave uses; TypeScript's DOM lib lacks some. */
export interface DirectoryHandle {
  readonly name: string
  getFileHandle(
    name: string,
    options?: { create?: boolean },
  ): Promise<{
    createWritable(): Promise<{ write(data: string): Promise<void>; close(): Promise<void> }>
  }>
  queryPermission(descriptor: { mode: 'readwrite' }): Promise<Permission>
  requestPermission(descriptor: { mode: 'readwrite' }): Promise<Permission>
}

export type AutosaveConfig = { dir: DirectoryHandle; minutes: number }

export const AUTOSAVE_MINUTES = [5, 10, 15, 30] as const
export const DEFAULT_MINUTES = 5

const KEY = 'ovoda-autosave'

type Picker = {
  showDirectoryPicker(options: { mode: 'readwrite'; id: string }): Promise<DirectoryHandle>
}

export function autosaveSupported(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window
}

/** The browser's folder picker; it rejects when she cancels. */
export function pickFolder(): Promise<DirectoryHandle> {
  return (window as unknown as Picker).showDirectoryPicker({
    mode: 'readwrite',
    id: 'ovoda-mentes',
  })
}

export async function loadAutosave(): Promise<AutosaveConfig | undefined> {
  const raw: unknown = await get(KEY)
  if (typeof raw !== 'object' || raw === null) return undefined
  const { dir, minutes } = raw as Partial<AutosaveConfig>
  return dir && typeof minutes === 'number' ? { dir, minutes } : undefined
}

export function saveAutosave(config: AutosaveConfig): Promise<void> {
  return set(KEY, config)
}

export function clearAutosave(): Promise<void> {
  return del(KEY)
}

/** What a backup holds, minus when it was taken: an autosave alone is not a change. */
export function contentOf(state: AppState): string {
  return backupJson({ ...state, lastBackupAt: undefined })
}

/** Writes the day's backup, `ovoda-mentes-YYYY-MM-DD.json`; the same day overwrites it. */
export async function writeBackupFile(
  dir: DirectoryHandle,
  state: AppState,
  today: string,
): Promise<string> {
  const name = backupFileName(today)
  const file = await dir.getFileHandle(name, { create: true })
  const writable = await file.createWritable()
  await writable.write(backupJson(state))
  await writable.close()
  return name
}

/** May the app write there? With `ask`, the browser asks her, which needs a click to start it. */
export async function canWrite(dir: DirectoryHandle, ask: boolean): Promise<boolean> {
  const descriptor = { mode: 'readwrite' } as const
  const permission = ask
    ? await dir.requestPermission(descriptor)
    : await dir.queryPermission(descriptor)
  return permission === 'granted'
}
