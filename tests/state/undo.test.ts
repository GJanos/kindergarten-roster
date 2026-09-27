// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Action } from '../../src/state/appState'
import { UNDO_LIMIT, useUndo } from '../../src/state/undo'

const W1 = '2026-10-26'
const W2 = '2026-11-02'
const reset: Action = { type: 'setOverride', week: W1, date: W1 }
const restore: Action = { type: 'restoreRoster', week: W1 }
const entry = (week: string, label: string) => ({
  week,
  label,
  undo: [reset, restore],
  changed: [],
})

function setup() {
  const dispatch = vi.fn<(action: Action) => void>()
  const { result } = renderHook(() => useUndo(dispatch))
  return { dispatch, result }
}

describe('useUndo', () => {
  it('undoes the latest change of a week by replaying its actions in order', () => {
    const { dispatch, result } = setup()
    act(() => result.current.record(entry(W1, 'first')))
    act(() => result.current.record(entry(W1, 'second')))
    expect(result.current.latest(W1)?.label).toBe('second')
    act(() => result.current.undo(result.current.latest(W1)!))
    expect(dispatch.mock.calls.map(([action]) => action)).toEqual([reset, restore])
    expect(result.current.latest(W1)?.label).toBe('first')
  })

  it('keeps each week to itself', () => {
    const { result } = setup()
    act(() => result.current.record(entry(W1, 'w1')))
    act(() => result.current.record(entry(W2, 'w2')))
    expect(result.current.latest(W1)?.label).toBe('w1')
    act(() => result.current.accept(W2))
    expect(result.current.latest(W2)).toBeUndefined()
    expect(result.current.latest(W1)?.label).toBe('w1')
  })

  it(`remembers the last ${UNDO_LIMIT} changes`, () => {
    const { result } = setup()
    for (let i = 0; i <= UNDO_LIMIT; i++) act(() => result.current.record(entry(W1, `${i}`)))
    expect(result.current.entries).toHaveLength(UNDO_LIMIT)
    expect(result.current.entries[0].label).toBe('1')
  })

  it('forgets everything when the data is replaced', () => {
    const { result } = setup()
    act(() => result.current.record(entry(W1, 'w1')))
    act(() => result.current.reset())
    expect(result.current.entries).toEqual([])
  })
})
