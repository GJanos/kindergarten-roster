import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { emptyState, reducer } from '../../src/state/appState'
import {
  canWrite,
  clearAutosave,
  contentOf,
  loadAutosave,
  saveAutosave,
  writeBackupFile,
  type DirectoryHandle,
} from '../../src/state/autosave'
import { fakeFolder } from './fakeFolder'

beforeEach(() => clearAutosave())

describe('autosave storage', () => {
  it('writes the backup under the day’s file name, overwriting it that day', async () => {
    const folder = fakeFolder()
    const state = reducer(emptyState(), { type: 'addStaff', id: 'a' })
    expect(await writeBackupFile(folder, emptyState(), '2026-10-18')).toBe(
      'ovoda-mentes-2026-10-18.json',
    )
    await writeBackupFile(folder, state, '2026-10-18')
    expect([...folder.files.keys()]).toEqual(['ovoda-mentes-2026-10-18.json'])
    expect(JSON.parse(folder.files.get('ovoda-mentes-2026-10-18.json')!).staff).toHaveLength(1)
    await writeBackupFile(folder, state, '2026-10-19')
    expect(folder.files.size).toBe(2) // yesterday's file stays as it was
  })

  it('ignores the backup time when checking for changes', () => {
    const state = emptyState()
    const backedUp = reducer(state, { type: 'markBackedUp', at: '2026-10-18T10:00:00.000Z' })
    expect(contentOf(backedUp)).toBe(contentOf(state))
    expect(contentOf(reducer(state, { type: 'addStaff', id: 'a' }))).not.toBe(contentOf(state))
  })

  it('asks for access only when told to', async () => {
    const folder = fakeFolder('Mentések', 'prompt')
    expect(await canWrite(folder, false)).toBe(false)
    expect(folder.permission).toBe('prompt')
    expect(await canWrite(folder, true)).toBe(true)
  })

  it('keeps the folder and the interval on this device', async () => {
    expect(await loadAutosave()).toBeUndefined()
    // A real folder handle survives IndexedDB; a plain stand-in shows the round trip.
    const dir = { name: 'Mentések' } as unknown as DirectoryHandle
    await saveAutosave({ dir, minutes: 10 })
    expect(await loadAutosave()).toEqual({ dir, minutes: 10 })
    await clearAutosave()
    expect(await loadAutosave()).toBeUndefined()
  })
})
