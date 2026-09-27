// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
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
const person = (id: string, fullName: string, displayName = fullName, role?: 'nanny'): Action[] => [
  { type: 'addStaff', id, ...(role ? { role } : {}) },
  { type: 'updateStaff', id, patch: { fullName, displayName } },
]
const rosterWith = (staffId: string): Action => {
  const roster: Roster = {
    period: { start: WEEK, days: [WEEK] },
    groupsPerDay: { [WEEK]: 0 },
    assignments: [{ staffId, date: WEEK, shift: 'morning' }],
    holes: [],
    warnings: [],
    ...TEST_META,
  }
  return { type: 'saveRoster', week: WEEK, roster, inputKey: 'k' }
}

function renderScreen(state: AppState) {
  const dispatch = vi.fn<(action: Action) => void>()
  render(<StaffScreen state={state} dispatch={dispatch} />)
  return dispatch
}

const column = (title: RegExp) => within(screen.getByRole('region', { name: title }))

describe('StaffScreen', () => {
  it('adds a teacher or a nanny from their own column', () => {
    const dispatch = renderScreen(emptyState())
    expect(screen.getByText(/Még nincs munkatárs/)).toBeTruthy()
    fireEvent.click(screen.getByText('+ Új óvónő'))
    expect(dispatch).toHaveBeenCalledWith({
      type: 'addStaff',
      id: expect.any(String),
      role: 'teacher',
    })
    fireEvent.click(screen.getByText('+ Új dajka'))
    expect(dispatch).toHaveBeenCalledWith({
      type: 'addStaff',
      id: expect.any(String),
      role: 'nanny',
    })
  })

  it('lists teachers and nannies in separate columns, inactive people last', () => {
    const state = run(
      ...person('a', 'Kiss Anna'),
      ...person('b', 'Nagy Bea'),
      ...person('n', 'Tóth Nóra', 'Nóra', 'nanny'),
      { type: 'updateStaff', id: 'a', patch: { active: false } },
    )
    renderScreen(state)
    const names = column(/Óvónők/)
      .getAllByLabelText('Teljes név')
      .map((input) => (input as HTMLInputElement).value)
    expect(names).toEqual(['Nagy Bea', 'Kiss Anna'])
    expect(column(/Dajkák/).getAllByLabelText('Teljes név')).toHaveLength(1)
  })

  it('edits the name in place and moves someone to the other column', () => {
    const dispatch = renderScreen(run(...person('a', 'Kiss Anna')))
    fireEvent.change(screen.getByLabelText('Teljes név'), { target: { value: 'Kiss Anna Mária' } })
    expect(dispatch).toHaveBeenCalledWith({
      type: 'updateStaff',
      id: 'a',
      patch: { fullName: 'Kiss Anna Mária' },
    })
    fireEvent.click(screen.getByText('→ Dajka'))
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

  it('offers deleting everyone, advising deactivation for people already rostered', () => {
    const state = run(...person('a', 'Kiss Anna'), ...person('b', 'Nagy Bea'), rosterWith('a'))
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const dispatch = renderScreen(state)
    const buttons = screen.getAllByText('Törlés')
    expect(buttons).toHaveLength(2)
    fireEvent.click(buttons[0])
    expect(confirm).toHaveBeenLastCalledWith(
      expect.stringMatching(/^Kiss Anna már szerepelt.*Aktív/s),
    )
    expect(dispatch).toHaveBeenCalledWith({ type: 'deleteStaff', id: 'a' })
    fireEvent.click(buttons[1])
    expect(confirm).toHaveBeenLastCalledWith('Biztosan törlöd: Nagy Bea?')
    expect(dispatch).toHaveBeenCalledWith({ type: 'deleteStaff', id: 'b' })
  })

  it('does not delete when she cancels', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    const dispatch = renderScreen(run(...person('a', 'Kiss Anna')))
    fireEvent.click(screen.getByText('Törlés'))
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('hides deleted people, also from the duplicate check', () => {
    const state = run(
      ...person('a', 'Kiss Anna', 'Anna'),
      ...person('b', 'Nagy Anna', 'Anna'),
      rosterWith('a'),
      { type: 'deleteStaff', id: 'a' },
    )
    renderScreen(state)
    expect(screen.getAllByLabelText('Teljes név')).toHaveLength(1)
    expect(screen.queryByText('Ez a név kétszer szerepel.')).toBeNull()
  })

  it('explains the less obvious parts in a legend', () => {
    renderScreen(run(...person('a', 'Kiss Anna')))
    expect(screen.getByText('ⓘ Tudnivalók')).toBeTruthy()
    expect(screen.getByText(/csak az aktív munkatársak kerülnek a beosztásba/)).toBeTruthy()
  })
})
