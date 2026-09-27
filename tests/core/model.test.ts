import loadHighs from 'highs'
import { describe, expect, it } from 'vitest'
import { TEST_META, consecutiveDays, makeInput } from './fixtures'
import { solve } from '../../src/core/solve'
import type { SolveInput } from '../../src/core/types'
import { validateRoster } from '../../src/core/validate'

const highs = await loadHighs()
const D = '2026-10-26'

function solveValid(input: SolveInput) {
  const roster = solve(input, highs, TEST_META)
  expect(validateRoster(input, roster)).toEqual([])
  return roster
}

describe('strict rules', () => {
  it('fills every seat when capacity allows', () => {
    const roster = solveValid(makeInput({ teachers: 4, nannies: 3, groups: 2 }))
    expect(roster.holes).toEqual([])
    expect(roster.assignments.some((a) => a.substitution)).toBe(false)
    expect(roster.assignments).toHaveLength(7 * 5)
  })

  it('leaves the absent out', () => {
    const input = makeInput({ teachers: 4, nannies: 3, groups: 2, absent: { t1: [D], n2: [D] } })
    const roster = solveValid(input)
    expect(roster.assignments.filter((a) => a.date === D)).toHaveLength(5)
  })

  it('leaves a teacher seat empty rather than break a rule', () => {
    const roster = solveValid(makeInput({ teachers: 3, nannies: 2, groups: 2, days: [D] }))
    expect(roster.holes).toEqual([
      { kind: 'teacherSeat', date: D, group: expect.any(Number), shift: expect.any(String) },
    ])
  })

  it('puts a teacher in a nanny seat only when the nannies run out', () => {
    const roster = solveValid(makeInput({ teachers: 5, nannies: 1, groups: 2, days: [D] }))
    expect(roster.assignments.filter((a) => a.substitution)).toHaveLength(1)
    expect(roster.holes.filter((h) => h.kind === 'teacherSeat')).toEqual([])
  })

  it('lets a lone nanny cover one key', () => {
    const roster = solveValid(makeInput({ teachers: 2, nannies: 1, groups: 1, days: [D] }))
    expect(roster.holes.filter((h) => h.kind !== 'teacherSeat')).toHaveLength(1)
  })

  it('starts only the groups the day can staff', () => {
    const roster = solveValid(makeInput({ teachers: 3, nannies: 1, groups: 3, days: [D] }))
    expect(roster.groupsPerDay[D]).toBe(2)
  })

  it('keeps a closed day empty', () => {
    const [mon, tue] = consecutiveDays(D, 2)
    const roster = solveValid(
      makeInput({ teachers: 4, nannies: 2, groups: 2, days: [mon, tue], overrides: { [tue]: 0 } }),
    )
    expect(roster.assignments.filter((a) => a.date === tue)).toEqual([])
    expect(roster.groupsPerDay[tue]).toBe(0)
  })

  it('lets nannies open and close on a day without teachers', () => {
    const input = makeInput({
      teachers: 2,
      nannies: 2,
      groups: 1,
      days: [D],
      absent: { t1: [D], t2: [D] },
    })
    const roster = solveValid(input)
    expect(roster.groupsPerDay[D]).toBe(0)
    expect(roster.holes).toEqual([])
  })

  it('never lets a nanny open, or close, on every day', () => {
    const roster = solveValid(
      makeInput({ teachers: 2, nannies: 2, groups: 1, days: consecutiveDays(D, 3) }),
    )
    for (const id of ['n1', 'n2']) {
      expect(roster.assignments.filter((a) => a.staffId === id && a.opener).length).toBeLessThan(3)
      expect(roster.assignments.filter((a) => a.staffId === id && a.closer).length).toBeLessThan(3)
    }
  })
})
