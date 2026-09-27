// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { emptyState } from '../../src/state/appState'
import { clearState, saveState } from '../../src/state/storage'
import { useAppState } from '../../src/state/useAppState'

// The real storage, with saveState watched.
vi.mock(import('../../src/state/storage'), async (importOriginal) => {
  const storage = await importOriginal()
  return { ...storage, saveState: vi.fn(storage.saveState) }
})

beforeEach(async () => {
  await clearState()
  await saveState(emptyState())
  vi.mocked(saveState).mockClear()
})

describe('useAppState', () => {
  it('never writes back what it only loaded, so a second window cannot overwrite the first', async () => {
    const { result } = renderHook(() => useAppState())
    await waitFor(() => expect(result.current.state).toEqual(emptyState()))
    expect(saveState).not.toHaveBeenCalled()
    act(() => result.current.dispatch({ type: 'addStaff', id: 'a' }))
    await waitFor(() => expect(saveState).toHaveBeenCalledTimes(1))
  })
})
