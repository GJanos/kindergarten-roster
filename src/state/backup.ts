import { backupFromXlsx } from '../export/xlsx'
import type { AppState } from './appState'
import { migrate } from './migrate'

export function backupFileName(today: string): string {
  return `ovoda-mentes-${today}.json`
}

export function backupJson(state: AppState): string {
  return JSON.stringify(state)
}

/** A .json backup or an exported Excel file → app state. Throws on anything else. */
export async function readBackup(fileName: string, bytes: ArrayBuffer): Promise<AppState> {
  const json = fileName.toLowerCase().endsWith('.xlsx')
    ? await backupFromXlsx(bytes)
    : new TextDecoder().decode(bytes)
  return migrate(JSON.parse(json))
}
