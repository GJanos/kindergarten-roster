import loadHighs from 'highs'
import { describe, expect, it } from 'vitest'
import { TEST_META, consecutiveDays, makeInput } from './fixtures'
import { groupSwitches, turnarounds } from '../../src/core/metrics'
import { solve } from '../../src/core/solve'
import type { Assignment, Roster, Seat, SolveInput } from '../../src/core/types'
import { validateRoster } from '../../src/core/validate'

const highs = await loadHighs()
const [MON, TUE, WED] = consecutiveDays('2026-10-26', 3)

function rosterOf(input: SolveInput, assignments: Assignment[]): Roster {
  return {
    period: input.period,
    groupsPerDay: {},
    assignments,
    holes: [],
    warnings: [],
    ...TEST_META,
  }
}

const seat = (group: number): Seat => ({ kind: 'nanny', group })
const work = (
  date: string,
  where?: number,
  shift: Assignment['shift'] = 'morning',
): Assignment => ({
  staffId: 'n1',
  date,
  shift,
  ...(where ? { seat: seat(where) } : {}),
})

describe('groupSwitches — the switch table', () => {
  const input = makeInput({ teachers: 0, nannies: 1, groups: 2, days: [MON, TUE, WED] })
  it.each([
    ['same group', [work(MON, 1), work(TUE, 1)], 0],
    ['another group', [work(MON, 1), work(TUE, 2)], 1],
    ['group, then reserve', [work(MON, 1), work(TUE)], 0],
    ['reserve breaks the chain', [work(MON, 1), work(TUE), work(WED, 2)], 0],
    ['absent breaks the chain', [work(MON, 1), work(WED, 2)], 0],
    ['each move counts', [work(MON, 1), work(TUE, 2), work(WED, 1)], 2],
  ])('%s', (_, assignments, switches) => {
    expect(groupSwitches(input, rosterOf(input, assignments))).toHaveLength(switches)
  })

  it('chains across a closed day', () => {
    const closed = makeInput({
      teachers: 0,
      nannies: 1,
      groups: 2,
      days: [MON, TUE, WED],
      overrides: { [TUE]: 0 },
    })
    expect(groupSwitches(closed, rosterOf(closed, [work(MON, 1), work(WED, 2)]))).toHaveLength(1)
  })
})

describe('turnarounds', () => {
  it('counts a nanny from 18:00 to 6:00 on the next calendar day only', () => {
    const input = makeInput({
      teachers: 0,
      nannies: 1,
      groups: 1,
      days: ['2026-10-30', '2026-11-02', '2026-11-03'],
    })
    const roster = rosterOf(input, [
      { staffId: 'n1', date: '2026-10-30', shift: 'afternoon' },
      { staffId: 'n1', date: '2026-11-02', shift: 'afternoon' },
      { staffId: 'n1', date: '2026-11-03', shift: 'morning' },
    ])
    expect(turnarounds(input, roster)).toEqual([
      { staffId: 'n1', late: '2026-11-02', early: '2026-11-03' },
    ])
  })
})

describe('the solver keeps people in place', () => {
  it('finds a week without group switches when one exists', () => {
    const input = makeInput({ teachers: 4, nannies: 3, groups: 2 })
    const roster = solve(input, highs, TEST_META)
    expect(validateRoster(input, roster)).toEqual([])
    expect(groupSwitches(input, roster)).toEqual([])
  })

  // Fairness outranks comfort: whoever closes on Monday must open later to balance
  // her mornings, so a short week often keeps one turnaround.
  it('accepts the one turnaround two nannies cannot avoid', () => {
    const input = makeInput({ teachers: 2, nannies: 2, groups: 1, days: [MON, TUE] })
    expect(turnarounds(input, solve(input, highs, TEST_META))).toHaveLength(1)
  })

  it('does not count a weekend in between', () => {
    const input = makeInput({
      teachers: 2,
      nannies: 2,
      groups: 1,
      days: ['2026-10-30', '2026-11-02'],
    })
    expect(turnarounds(input, solve(input, highs, TEST_META))).toEqual([])
  })
})
