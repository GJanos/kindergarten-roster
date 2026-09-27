import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { emptyState } from '../../src/state/appState'
import { clearState, loadState, saveState } from '../../src/state/storage'

describe('storage', () => {
  it('is empty before the first start, then keeps the whole state', async () => {
    await clearState()
    expect(await loadState()).toBeNull()
    const state = { ...emptyState(), lastBackupAt: '2026-10-01T10:00:00.000Z' }
    await saveState(state)
    expect(await loadState()).toEqual(state)
    await clearState()
    expect(await loadState()).toBeNull()
  })
})
