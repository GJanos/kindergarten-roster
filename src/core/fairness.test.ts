import loadHighs from 'highs'
import { describe, expect, it } from 'vitest'
import { apportionmentFloor, fairShares, gapOf, worstGapFloor } from './fairness'
import { TEST_META, consecutiveDays, makeInput } from './fixtures'
import { solve } from './solve'
import { validateRoster } from './validate'

const highs = await loadHighs()
const WEEK = consecutiveDays('2026-10-26', 5)

describe('fairShares', () => {
  it('splits mornings, reserve days and keys by days worked', () => {
    const input = makeInput({ teachers: 3, nannies: 3, groups: 1, days: WEEK.slice(0, 2) })
    const share = (staffId: string, kind: string) =>
      fairShares(input).find((s) => s.staffId === staffId && s.kind === kind)
    expect(share('t1', 'morning')).toMatchObject({ num: 2, den: 2 })
    // Each day one of three teachers is spare: 2 reserve days over 6 teacher-days.
    expect(share('t1', 'reserve')).toMatchObject({ num: 4, den: 6, pool: 'reserve:teacher' })
    // Each day two of three nannies are spare: 4 reserve days over 6 nanny-days.
    expect(share('n1', 'reserve')).toMatchObject({ num: 8, den: 6 })
    expect(share('n1', 'opener')).toMatchObject({ num: 4, den: 6, pool: 'opener' })
    expect(share('t1', 'opener')).toBeUndefined()
  })

  it('leaves days with a lone nanny out of the key balance', () => {
    const input = makeInput({
      teachers: 2,
      nannies: 2,
      groups: 1,
      days: WEEK.slice(0, 2),
      absent: { n2: [WEEK[0]] },
    })
    const opener = fairShares(input).find((s) => s.staffId === 'n1' && s.kind === 'opener')
    expect(opener?.days).toEqual([WEEK[1]])
  })
})

describe('floors', () => {
  it('deals out whole counts: 15 reserve days among 7 nannies leave someone 6/7 off', () => {
    expect(apportionmentFloor(Array(7).fill(75), 35)).toBeCloseTo(6 / 7)
    expect(apportionmentFloor([4, 4, 4], 6)).toBeCloseTo(2 / 3)
    expect(apportionmentFloor([6, 6], 6)).toBe(0)
  })

  it('is at least a half when someone works an odd number of days', () => {
    const input = makeInput({ teachers: 2, nannies: 2, groups: 1, days: WEEK.slice(0, 3) })
    expect(worstGapFloor(fairShares(input))).toBeGreaterThanOrEqual(0.5)
  })
})

describe('the solver balances', () => {
  it('gives a nanny working 3 of 5 days one opening (spec §11)', () => {
    const input = makeInput({
      teachers: 4,
      nannies: 4,
      groups: 2,
      absent: { n4: [WEEK[2], WEEK[3]] },
    })
    const roster = solve(input, highs, TEST_META)
    expect(validateRoster(input, roster)).toEqual([])
    expect(roster.assignments.filter((a) => a.staffId === 'n4' && a.opener)).toHaveLength(1)
  })

  it('splits mornings evenly and keeps every gap under one', () => {
    const input = makeInput({ teachers: 4, nannies: 3, groups: 2, days: WEEK.slice(0, 4) })
    const roster = solve(input, highs, TEST_META)
    for (const id of ['t1', 't2', 't3', 't4', 'n1', 'n2', 'n3']) {
      expect(
        roster.assignments.filter((a) => a.staffId === id && a.shift === 'morning'),
      ).toHaveLength(2)
    }
    for (const share of fairShares(input)) expect(gapOf(share, roster)).toBeLessThan(1)
  })
})
