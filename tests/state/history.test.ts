import { describe, expect, it } from 'vitest'
import { TEST_META, makeStaff } from '../core/fixtures'
import type { Balance, Roster } from '../../src/core/types'
import { emptyState, type AppState } from '../../src/state/appState'
import { yearStart, yearTotals, yearlyHistory } from '../../src/state/history'

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

describe('yearTotals', () => {
  it("counts the year's worked days per person up to this week, with the deltas", () => {
    const monday = '2026-10-26'
    const period = saved(monday, { t1: { morning: 0.5 }, n1: { opener: 0.5, reserve: -0.5 } })
    period.roster.assignments = [
      {
        staffId: 't1',
        date: monday,
        shift: 'morning',
        seat: { kind: 'teacher', group: 1, shift: 'morning' },
      },
      {
        staffId: 'n1',
        date: monday,
        shift: 'morning',
        seat: { kind: 'nanny', group: 1 },
        opener: true,
      },
      { staffId: 'n1', date: '2026-10-27', shift: 'afternoon', closer: true },
    ]
    const state: AppState = {
      ...emptyState(),
      staff: makeStaff(1, 1),
      periods: { [monday]: period, '2026-11-09': saved('2026-11-09', { t1: { morning: 9 } }) },
    }
    expect(yearTotals(state, '2026-11-05')).toEqual([
      {
        staffId: 't1',
        counts: { morning: 1, afternoon: 0, opener: 0, closer: 0, reserve: 0 },
        deltas: { morning: 0.5 },
      },
      {
        staffId: 'n1',
        counts: { morning: 1, afternoon: 1, opener: 1, closer: 1, reserve: 1 },
        deltas: { opener: 0.5, reserve: -0.5 },
      },
    ])
  })
})
