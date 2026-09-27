import { describe, expect, it } from 'vitest'
import { TEST_META } from '../core/fixtures'
import type { Roster } from '../../src/core/types'
import { rosterWorkbook, workbookBytes } from '../../src/export/xlsx'
import { emptyState, type AppState } from '../../src/state/appState'
import { backupFileName, backupJson, readBackup } from '../../src/state/backup'

// Big enough to need several 30,000-character cells, with accents and spaces.
function bigState(): AppState {
  const staff = Array.from({ length: 40 }, (_, i) => ({
    id: `id-${i}`,
    fullName: `Ősz Árvíztűrő Tükörfúrógép ${i}`,
    displayName: `Ősz ${i}`,
    role: i % 3 ? ('teacher' as const) : ('nanny' as const),
    active: true,
  }))
  const absences = staff.flatMap((s) =>
    Array.from({ length: 60 }, (_, d) => ({
      staffId: s.id,
      date: `2026-${String(9 + (d % 3)).padStart(2, '0')}-${String(1 + (d % 28)).padStart(2, '0')}`,
    })),
  )
  return { ...emptyState(), staff, absences, lastBackupAt: '2026-10-01T10:00:00.000Z' }
}

const bytesOf = (text: string) => new TextEncoder().encode(text).buffer as ArrayBuffer

describe('backups', () => {
  it('names the file by date', () => {
    expect(backupFileName('2026-10-26')).toBe('ovoda-mentes-2026-10-26.json')
  })

  it('round-trips through a .json file', async () => {
    const state = bigState()
    expect(await readBackup('ovoda-mentes-2026-10-26.json', bytesOf(backupJson(state)))).toEqual(
      state,
    )
  })

  it('round-trips through the hidden sheet of an exported Excel', async () => {
    const state = bigState()
    expect(backupJson(state).length).toBeGreaterThan(60_000)
    const roster: Roster = {
      period: { start: '2026-10-26', days: ['2026-10-26'] },
      groupsPerDay: { '2026-10-26': 0 },
      assignments: [],
      holes: [],
      warnings: [],
      ...TEST_META,
    }
    const workbook = await rosterWorkbook(roster, state.staff, state.absences, {
      backupJson: backupJson(state),
    })
    const bytes = await workbookBytes(workbook)
    expect(await readBackup('beosztas-2026-10-26.xlsx', bytes.buffer)).toEqual(state)
  })

  it('rejects files that are not backups', async () => {
    await expect(readBackup('notes.json', bytesOf('{"hello": 1}'))).rejects.toThrow()
    await expect(readBackup('notes.json', bytesOf('not json'))).rejects.toThrow()
  })
})
