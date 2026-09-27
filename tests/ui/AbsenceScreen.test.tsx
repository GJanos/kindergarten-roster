// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { emptyState, reducer, type Action } from '../../src/state/appState'
import { AbsenceScreen } from '../../src/ui/AbsenceScreen'

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 5, 12))
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const actions: Action[] = [
  { type: 'addStaff', id: 'n' },
  {
    type: 'updateStaff',
    id: 'n',
    patch: { fullName: 'Nagy Nóra', displayName: 'Nóra', role: 'nanny' },
  },
  { type: 'addStaff', id: 'a' },
  { type: 'updateStaff', id: 'a', patch: { fullName: 'Kiss Anna', displayName: 'Anna' } },
]
const state = actions.reduce(reducer, emptyState())

function renderScreen() {
  const dispatch = vi.fn<(action: Action) => void>()
  render(<AbsenceScreen state={state} dispatch={dispatch} />)
  return dispatch
}

describe('AbsenceScreen', () => {
  it('shows this month, teachers first', () => {
    renderScreen()
    expect(screen.getByText('2026. október')).toBeTruthy()
    expect(screen.getAllByText(/^(Anna|Nóra)$/).map((cell) => cell.textContent)).toEqual([
      'Anna',
      'Nóra',
    ])
  })

  it('marks a day, and a stretch by dragging along the row', () => {
    const dispatch = renderScreen()
    fireEvent.pointerDown(screen.getByLabelText('Anna 2026-10-26'))
    fireEvent.pointerEnter(screen.getByLabelText('Anna 2026-10-27'))
    fireEvent.pointerEnter(screen.getByLabelText('Nóra 2026-10-27')) // another row: ignored
    fireEvent.pointerUp(window)
    fireEvent.pointerEnter(screen.getByLabelText('Anna 2026-10-28')) // released: ignored
    expect(dispatch.mock.calls.map(([action]) => action)).toEqual([
      { type: 'setAbsent', staffId: 'a', dates: ['2026-10-26'], absent: true },
      { type: 'setAbsent', staffId: 'a', dates: ['2026-10-27'], absent: true },
    ])
  })

  it('leaves weekends and holidays out', () => {
    renderScreen()
    expect(screen.queryByLabelText('Anna 2026-10-24')).toBeNull() // Saturday
    expect(screen.queryByLabelText('Anna 2026-10-23')).toBeNull() // national holiday
    expect(screen.getByLabelText('Anna 2026-10-22')).toBeTruthy()
  })

  it('moves between months', () => {
    renderScreen()
    fireEvent.click(screen.getByLabelText('Következő hónap'))
    expect(screen.getByText('2026. november')).toBeTruthy()
  })
})
