// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TEST_META } from '../core/fixtures'
import type { Roster } from '../../src/core/types'
import { emptyState, reducer, type Action, type AppState } from '../../src/state/appState'
import { StaffScreen } from '../../src/ui/StaffScreen'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const WEEK = '2026-10-26'
const run = (...actions: Action[]) => actions.reduce(reducer, emptyState())
const person = (id: string, fullName: string, displayName = fullName): Action[] => [
  { type: 'addStaff', id },
  { type: 'updateStaff', id, patch: { fullName, displayName } },
]

function renderScreen(state: AppState) {
  const dispatch = vi.fn<(action: Action) => void>()
  render(<StaffScreen state={state} dispatch={dispatch} />)
  return dispatch
}

describe('StaffScreen', () => {
  it('adds a new person', () => {
    const dispatch = renderScreen(emptyState())
    expect(screen.getByText(/Még nincs munkatárs/)).toBeTruthy()
    fireEvent.click(screen.getByText('+ Új munkatárs'))
    expect(dispatch).toHaveBeenCalledWith({ type: 'addStaff', id: expect.any(String) })
  })

  it('edits the name and the role in place', () => {
    const dispatch = renderScreen(run(...person('a', 'Kiss Anna')))
    fireEvent.change(screen.getByLabelText('Teljes név'), { target: { value: 'Kiss Anna Mária' } })
    expect(dispatch).toHaveBeenCalledWith({
      type: 'updateStaff',
      id: 'a',
      patch: { fullName: 'Kiss Anna Mária' },
    })
    fireEvent.click(screen.getByText('Dajka'))
    expect(dispatch).toHaveBeenCalledWith({
      type: 'updateStaff',
      id: 'a',
      patch: { role: 'nanny' },
    })
  })

  it('warns when two people share a display name', () => {
    renderScreen(run(...person('a', 'Kiss Anna', 'Anna'), ...person('b', 'Nagy Anna', 'Anna')))
    expect(screen.getAllByText('Ez a név kétszer szerepel.')).toHaveLength(2)
  })

  it('deletes only people never rostered, after asking', () => {
    const roster: Roster = {
      period: { start: WEEK, days: [WEEK] },
      groupsPerDay: { [WEEK]: 0 },
      assignments: [{ staffId: 'a', date: WEEK, shift: 'morning' }],
      holes: [],
      warnings: [],
      ...TEST_META,
    }
    const state = run(...person('a', 'Kiss Anna'), ...person('b', 'Nagy Bea'), {
      type: 'saveRoster',
      week: WEEK,
      roster,
      inputKey: 'k',
    })
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const dispatch = renderScreen(state)
    const buttons = screen.getAllByText('Törlés')
    expect(buttons).toHaveLength(1)
    fireEvent.click(buttons[0])
    expect(confirm).toHaveBeenCalledWith('Biztosan törlöd: Nagy Bea?')
    expect(dispatch).toHaveBeenCalledWith({ type: 'deleteStaff', id: 'b' })
  })
})
