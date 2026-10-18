// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { emptyState, reducer, type Action, type AppState } from '../../src/state/appState'
import type { AutosaveConfig, DirectoryHandle } from '../../src/state/autosave'
import { useAutosave, type AutosaveDeps } from '../../src/ui/useAutosave'
import { fakeFolder, type FakeFolder } from '../state/fakeFolder'

const NOW = new Date(2026, 9, 18, 10, 42)
const FILE = 'ovoda-mentes-2026-10-18.json'
const MINUTE = 60_000

/** Lets the pending promises (IndexedDB, permission checks, writes) finish. setTimeout stays real. */
const settle = () => act(() => new Promise<void>((resolve) => setTimeout(resolve, 0)))

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

/** The browser's parts, in memory: a stored config (or none) and a picker that returns `folder`. */
function setup(stored?: AutosaveConfig, folder: FakeFolder = fakeFolder()) {
  let config = stored
  const deps: AutosaveDeps = {
    supported: () => true,
    pick: vi.fn(async () => folder as DirectoryHandle),
    load: async () => config,
    save: async (next) => {
      config = next
    },
    clear: async () => {
      config = undefined
    },
  }
  const dispatch = vi.fn<(action: Action) => void>()
  const view = renderHook(
    ({ state }: { state: AppState }) => useAutosave(state, dispatch, deps, () => NOW),
    { initialProps: { state: emptyState() } },
  )
  return { ...view, deps, dispatch, folder, config: () => config }
}

describe('useAutosave', () => {
  it('starts off, picks a folder when switched on, and saves at once', async () => {
    const { result, dispatch, folder, config } = setup()
    await settle()
    expect(result.current.status).toBe('off')
    await act(() => result.current.enable())
    expect(result.current.status).toBe('on')
    expect(folder.files.has(FILE)).toBe(true)
    expect(result.current.fileName).toBe(FILE)
    expect(result.current.folder).toBe('Mentések')
    expect(config()?.minutes).toBe(5)
    // It counts as a backup: the footer's "last saved" resets.
    expect(dispatch).toHaveBeenCalledWith({ type: 'markBackedUp', at: NOW.toISOString() })
  })

  it('stays off when she cancels the folder picker', async () => {
    const { result, deps } = setup()
    await settle()
    expect(result.current.status).toBe('off')
    vi.mocked(deps.pick).mockRejectedValueOnce(new DOMException('cancelled', 'AbortError'))
    await act(() => result.current.enable())
    expect(result.current.status).toBe('off')
  })

  it('saves on the interval only when something changed', async () => {
    const folder = fakeFolder()
    const { result, rerender } = setup({ dir: folder, minutes: 5 }, folder)
    await settle()
    expect(result.current.status).toBe('on')
    await act(() => vi.advanceTimersByTimeAsync(5 * MINUTE))
    expect(folder.files.size).toBe(1) // the first tick of a session saves
    folder.files.clear()
    await act(() => vi.advanceTimersByTimeAsync(5 * MINUTE))
    expect(folder.files.size).toBe(0) // nothing changed
    rerender({ state: reducer(emptyState(), { type: 'addStaff', id: 'a' }) })
    await act(() => vi.advanceTimersByTimeAsync(4 * MINUTE))
    expect(folder.files.size).toBe(0) // not yet
    await act(() => vi.advanceTimersByTimeAsync(MINUTE))
    expect(folder.files.size).toBe(1)
  })

  it('saves a change when the tab is hidden or closed', async () => {
    const folder = fakeFolder()
    const { result, rerender } = setup({ dir: folder, minutes: 30 }, folder)
    await settle()
    expect(result.current.status).toBe('on')
    rerender({ state: reducer(emptyState(), { type: 'addStaff', id: 'a' }) })
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await settle()
    expect(folder.files.size).toBe(1)
  })

  it('pauses, loudly, until she allows the folder again after a restart', async () => {
    const folder = fakeFolder('Mentések', 'prompt')
    const { result } = setup({ dir: folder, minutes: 5 }, folder)
    await settle()
    expect(result.current.status).toBe('paused')
    await act(() => vi.advanceTimersByTimeAsync(5 * MINUTE))
    expect(folder.files.size).toBe(0)
    await act(() => result.current.allow())
    expect(result.current.status).toBe('on')
    expect(folder.files.size).toBe(1)
  })

  it('says so when a save fails, and tries again on request', async () => {
    const folder = fakeFolder()
    const { result } = setup(undefined, folder)
    await settle()
    expect(result.current.status).toBe('off')
    folder.failWrites = true
    await act(() => result.current.enable())
    expect(result.current.status).toBe('failed')
    folder.failWrites = false
    await act(() => result.current.retry())
    expect(result.current.status).toBe('on')
  })

  it('changes the interval and switches off, forgetting the folder', async () => {
    const folder = fakeFolder()
    const { result, config } = setup({ dir: folder, minutes: 5 }, folder)
    await settle()
    expect(result.current.status).toBe('on')
    await act(() => result.current.setMinutes(15))
    expect(result.current.minutes).toBe(15)
    expect(config()?.minutes).toBe(15)
    await act(() => result.current.disable())
    expect(result.current.status).toBe('off')
    expect(config()).toBeUndefined()
  })

  it('never saves the demo, which would overwrite her real file of the day', async () => {
    const folder = fakeFolder()
    const { result, rerender } = setup({ dir: folder, minutes: 5 }, folder)
    rerender({ state: { ...emptyState(), demo: true } })
    await settle()
    expect(result.current.status).toBe('demo')
    await act(() => vi.advanceTimersByTimeAsync(10 * MINUTE))
    expect(folder.files.size).toBe(0)
  })

  it('is unavailable where the browser has no folder access', () => {
    const { result } = renderHook(() =>
      useAutosave(emptyState(), vi.fn(), {
        supported: () => false,
        pick: vi.fn(),
        load: vi.fn(),
        save: vi.fn(),
        clear: vi.fn(),
      }),
    )
    expect(result.current.status).toBe('unsupported')
  })
})
