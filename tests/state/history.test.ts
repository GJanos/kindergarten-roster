import { describe, expect, it } from 'vitest'
import { TEST_META } from '../core/fixtures'
import type { Balance, Roster } from '../../src/core/types'
import { emptyState, type AppState } from '../../src/state/appState'
import { yearStart, yearlyHistory } from '../../src/state/history'

const saved = (monday: string, balance: Balance): { dayPlans: []; roster: Roster } => ({
  dayPlans: [],
  roster: {
    period: { start: monday, days: [] },
    groupsPerDay: {},
    assignments: [],
    holes: [],
    warnings: [],
    balance,
    ...TEST_META,
  },
})

describe('yearStart', () => {
  it('is Sep 1 of the kindergarten year the date falls in', () => {
    expect(yearStart('2026-10-26')).toBe('2026-09-01')
    expect(yearStart('2027-03-01')).toBe('2026-09-01')
    expect(yearStart('2026-09-01')).toBe('2026-09-01')
    expect(yearStart('2026-08-31')).toBe('2025-09-01')
  })
})

describe('yearlyHistory', () => {
  it("sums the year's earlier rosters, and only those", () => {
    const state: AppState = {
      ...emptyState(),
      periods: {
        '2026-08-24': saved('2026-08-24', { n1: { opener: 5 } }), // last year
        '2026-10-26': saved('2026-10-26', { n1: { opener: 0.5 } }),
        '2026-12-21': saved('2026-12-21', { n1: { opener: 0.5 }, n2: { closer: -0.5 } }),
        '2027-01-04': saved('2027-01-04', { n1: { opener: 9 } }), // the week itself
        '2027-02-15': saved('2027-02-15', { n1: { opener: 9 } }), // later
      },
    }
    expect(yearlyHistory(state, '2027-01-04')).toEqual({ n1: { opener: 1 }, n2: { closer: -0.5 } })
  })

  it('counts a roster saved before v2 (no balance) as nothing', () => {
    const state: AppState = {
      ...emptyState(),
      periods: {
        '2026-10-26': {
          dayPlans: [],
          roster: { ...saved('2026-10-26', {}).roster, balance: undefined },
        },
      },
    }
    expect(yearlyHistory(state, '2026-11-02')).toEqual({})
  })
})
