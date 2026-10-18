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

describe('ügyelet (v3-b)', () => {
  const dutyGroupOf = (roster: ReturnType<typeof solveValid>, date: string) => {
    const groups = roster.assignments
      .filter((a) => a.date === date && a.duty)
      .map((a) => (a.seat?.kind === 'teacher' ? a.seat.group : 0))
    return [...new Set(groups)]
  }

  it('puts exactly one group on duty every day, both its teachers', () => {
    const roster = solveValid(
      makeInput({ teachers: 8, nannies: 5, groups: 4, days: consecutiveDays('2026-10-26', 3) }),
    )
    for (const date of roster.period.days) {
      expect(dutyGroupOf(roster, date)).toHaveLength(1)
      expect(roster.assignments.filter((a) => a.date === date && a.duty)).toHaveLength(2)
    }
    expect(roster.holes).toEqual([])
  })

  it('spreads duty evenly: 6 teachers, 3 days, 6 duty days → one each', () => {
    const days = consecutiveDays('2026-10-26', 3)
    const roster = solveValid(makeInput({ teachers: 6, nannies: 4, groups: 3, days }))
    for (const id of ['t1', 't2', 't3', 't4', 't5', 't6']) {
      expect(roster.assignments.filter((a) => a.staffId === id && a.duty)).toHaveLength(1)
    }
  })

  it('spreads duty on a short week too: 7 teachers, 4 groups, an empty seat every day', () => {
    const days = consecutiveDays('2026-10-26', 3)
    const roster = solveValid(makeInput({ teachers: 7, nannies: 4, groups: 4, days }))
    for (const id of ['t1', 't2', 't3', 't4', 't5', 't6', 't7']) {
      expect(
        roster.assignments.filter((a) => a.staffId === id && a.duty).length,
      ).toBeLessThanOrEqual(1)
    }
  })

  it('reports a duty hole when no group has both teachers', () => {
    const roster = solveValid(makeInput({ teachers: 2, nannies: 2, groups: 2, days: [D] }))
    expect(roster.holes).toContainEqual({ kind: 'duty', date: D })
  })
})

describe('her v3-b soft rules', () => {
  const nannyShift = (roster: ReturnType<typeof solveValid>, date: string, g: number) =>
    roster.assignments.find(
      (a) => a.date === date && a.seat?.kind === 'nanny' && a.seat.group === g,
    )?.shift

  it('splits each pair of groups: one nanny DE, the other DU', () => {
    const roster = solveValid(
      makeInput({ teachers: 8, nannies: 5, groups: 4, days: consecutiveDays('2026-10-26', 3) }),
    )
    for (const date of roster.period.days) {
      expect(nannyShift(roster, date, 1)).not.toBe(nannyShift(roster, date, 2))
      expect(nannyShift(roster, date, 3)).not.toBe(nannyShift(roster, date, 4))
    }
  })

  it('keeps each day within one between DE and DU, per role', () => {
    const roster = solveValid(
      makeInput({ teachers: 9, nannies: 6, groups: 4, days: consecutiveDays('2026-10-26', 3) }),
    )
    for (const date of roster.period.days) {
      for (const prefix of ['t', 'n']) {
        const today = roster.assignments.filter((a) => a.date === date && a.staffId[0] === prefix)
        const morning = today.filter((a) => a.shift === 'morning').length
        expect(Math.abs(2 * morning - today.length)).toBeLessThanOrEqual(1)
      }
    }
  })

  it('takes the keys from seated nannies when one is on the right shift', () => {
    // One day, so "nobody opens every day" can't force a reserve nanny onto a key.
    const roster = solveValid(makeInput({ teachers: 4, nannies: 3, groups: 2, days: [D] }))
    for (const a of roster.assignments.filter((x) => x.opener || x.closer)) {
      expect(a.seat).toBeDefined()
    }
  })
})

describe('helpers (v3-c)', () => {
  const on = (roster: ReturnType<typeof solveValid>, id: string, date = D) =>
    roster.assignments.find((a) => a.staffId === id && a.date === date)

  it('keeps an asszisztens on 8–16 beside a DE teacher when no teacher is missing', () => {
    const roster = solveValid(
      makeInput({ teachers: 4, nannies: 2, assistants: 1, groups: 2, days: consecutiveDays(D, 3) }),
    )
    for (const date of roster.period.days) {
      const a1 = on(roster, 'a1', date)!
      expect(a1.shift).toBe('day')
      expect(a1.seat?.kind).toBe('helper')
      const de = roster.assignments.find(
        (a) =>
          a.date === date &&
          a.seat?.kind === 'teacher' &&
          a.seat.shift === 'morning' &&
          a.seat.group === a1.seat!.group,
      )
      expect(de?.staffId[0]).toBe('t')
    }
    // The switches stage keeps her in one group.
    expect(
      new Set(roster.assignments.filter((a) => a.staffId === 'a1').map((a) => a.seat?.group)).size,
    ).toBe(1)
  })

  it('moves her to 10–18 only for a missing DU teacher, and the group keeps its DE teacher', () => {
    const roster = solveValid(
      makeInput({ teachers: 3, nannies: 2, assistants: 1, groups: 2, days: [D] }),
    )
    expect(roster.holes).toEqual([])
    const a1 = on(roster, 'a1')!
    expect(a1).toMatchObject({ shift: 'afternoon', substitution: true })
    expect(a1.seat).toMatchObject({ kind: 'teacher', shift: 'afternoon' })
  })

  it('puts a civil in a nanny seat before a teacher, on 6–14 or 10–18', () => {
    const roster = solveValid(
      makeInput({ teachers: 5, nannies: 1, civils: 1, groups: 2, days: [D] }),
    )
    expect(roster.assignments.filter((a) => a.substitution).map((a) => a.staffId)).toEqual(['c1'])
    expect(on(roster, 'c1')!.shift).not.toBe('day')
  })

  it('lets a civil stand-in hold the key a lone nanny cannot', () => {
    const roster = solveValid(
      makeInput({ teachers: 4, nannies: 1, civils: 1, groups: 2, days: [D] }),
    )
    expect(roster.holes).toEqual([])
    const c1 = on(roster, 'c1')!
    expect(c1.opener || c1.closer).toBe(true)
  })

  it('keeps a civil on 8–16, out of every seat, while the nannies suffice', () => {
    const roster = solveValid(
      makeInput({ teachers: 4, nannies: 3, civils: 1, groups: 2, days: [D] }),
    )
    expect(on(roster, 'c1')).toEqual({ staffId: 'c1', date: D, shift: 'day' })
  })

  it('leaves the extra asszisztens in no group', () => {
    const roster = solveValid(
      makeInput({ teachers: 2, nannies: 1, assistants: 2, groups: 1, days: [D] }),
    )
    const seats = ['a1', 'a2'].map((id) => on(roster, id)!.seat?.kind)
    expect(seats.sort()).toEqual(['helper', undefined])
  })

  it('lets her DU stand-in group be the ügyelet', () => {
    // 2 teachers, 2 groups: no group has both teachers; her group can.
    const roster = solveValid(
      makeInput({ teachers: 2, nannies: 2, assistants: 1, groups: 2, days: [D] }),
    )
    expect(roster.holes.filter((h) => h.kind === 'duty')).toEqual([])
    expect(on(roster, 'a1')!.duty).toBe(true)
  })
})
