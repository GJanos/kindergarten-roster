// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { TEST_META, makeStaff } from '../core/fixtures'
import { emptyState, type AppState } from '../../src/state/appState'
import { YearBalance } from '../../src/ui/YearBalance'

afterEach(cleanup)

const MON = '2026-10-26'
const state: AppState = {
  ...emptyState(),
  staff: makeStaff(1, 0),
  periods: {
    [MON]: {
      dayPlans: [],
      roster: {
        period: { start: MON, days: [MON] },
        groupsPerDay: { [MON]: 1 },
        assignments: [
          {
            staffId: 't1',
            date: MON,
            shift: 'morning',
            seat: { kind: 'teacher', group: 1, shift: 'morning' },
          },
        ],
        holes: [],
        warnings: [],
        balance: { t1: { morning: 0.5 } },
        ...TEST_META,
      },
    },
  },
}

describe('YearBalance', () => {
  it('shows the year per person, afternoons as the other side of mornings', () => {
    render(<YearBalance state={state} today="2026-11-05" />)
    expect(screen.getByText(/Éves egyenleg \(2026\/27\)/)).toBeTruthy()
    const row = screen.getByText('T1').closest('tr')!
    expect(row.textContent).toBe('T11 (+0,5)0 (−0,5)000')
  })

  it('shows zeros and says it fills up, before the first saved roster of the year', () => {
    render(<YearBalance state={{ ...state, periods: {} }} today="2026-11-05" />)
    expect(screen.getByText(/Éves egyenleg/)).toBeTruthy()
    expect(screen.getByText(/első mentett beosztás/)).toBeTruthy()
    expect(screen.getByText('T1').closest('tr')!.textContent).toBe('T100000')
  })

  it('drops the note once a roster is saved', () => {
    render(<YearBalance state={state} today="2026-11-05" />)
    expect(screen.queryByText(/első mentett beosztás/)).toBeNull()
  })

  it('shows nothing while there is no staff', () => {
    const { container } = render(<YearBalance state={emptyState()} today="2026-11-05" />)
    expect(container.textContent).toBe('')
  })
})
