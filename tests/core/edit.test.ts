import loadHighs from 'highs'
import { describe, expect, it } from 'vitest'
import { TEST_META, makeInput, makeStaff, randomInput, seededRandom } from './fixtures'
import { makeRoster } from '../../src/core/pipeline'
import { validateRoster } from '../../src/core/validate'
import { balanceOf } from '../../src/core/fairness'
import type { Roster } from '../../src/core/types'
import { editRoster, swapDay } from '../../src/core/edit'

const WED = '2026-10-28'
const staff = makeStaff(3, 3)

const roster: Roster = {
  period: { start: WED, days: [WED] },
  groupsPerDay: { [WED]: 1 },
  assignments: [
    {
      staffId: 't1',
      date: WED,
      shift: 'morning',
      seat: { kind: 'teacher', group: 1, shift: 'morning' },
    },
    {
      staffId: 't2',
      date: WED,
      shift: 'afternoon',
      seat: { kind: 'teacher', group: 1, shift: 'afternoon' },
    },
    { staffId: 't3', date: WED, shift: 'afternoon' },
    { staffId: 'n1', date: WED, shift: 'morning', seat: { kind: 'nanny', group: 1 }, opener: true },
    { staffId: 'n2', date: WED, shift: 'afternoon', closer: true },
    { staffId: 'n3', date: WED, shift: 'morning' },
  ],
  holes: [],
  warnings: [],
  ...TEST_META,
}
const dayOf = (r: Roster, id: string) => r.assignments.find((a) => a.staffId === id)

describe('swapDay', () => {
  it("exchanges two people's shift and seat", () => {
    const swapped = swapDay(roster, staff, { date: WED, a: 't1', b: 't3' })
    expect(dayOf(swapped, 't1')).toEqual({ staffId: 't1', date: WED, shift: 'afternoon' })
    expect(dayOf(swapped, 't3')).toEqual({
      staffId: 't3',
      date: WED,
      shift: 'morning',
      seat: { kind: 'teacher', group: 1, shift: 'morning' },
    })
  })

  it('moves the opener and closer with the day', () => {
    const swapped = swapDay(roster, staff, { date: WED, a: 'n1', b: 'n3' })
    expect(dayOf(swapped, 'n3')).toMatchObject({ opener: true, seat: { kind: 'nanny', group: 1 } })
    expect(dayOf(swapped, 'n1')).toEqual({ staffId: 'n1', date: WED, shift: 'morning' })
  })

  it('makes a teacher in a nanny seat a substitution, and a nanny in it not one', () => {
    const swapped = swapDay(roster, staff, { date: WED, a: 'n1', b: 't3' })
    expect(dayOf(swapped, 't3')).toMatchObject({
      seat: { kind: 'nanny', group: 1 },
      substitution: true,
    })
    const back = swapDay(swapped, staff, { date: WED, a: 'n1', b: 't3' })
    expect(back.assignments).toEqual(roster.assignments)
  })

  it('leaves everyone else and the input roster alone', () => {
    const before = structuredClone(roster)
    const swapped = swapDay(roster, staff, { date: WED, a: 't1', b: 't3' })
    expect(roster).toEqual(before)
    expect(dayOf(swapped, 'n2')).toBe(dayOf(roster, 'n2'))
  })

  it('refuses someone who is not working that day, or a swap with oneself', () => {
    expect(() => swapDay(roster, staff, { date: WED, a: 't1', b: 'gone' })).toThrow(/gone/)
    expect(() => swapDay(roster, staff, { date: WED, a: 't1', b: 't1' })).toThrow()
  })
})

const highs = await loadHighs()

function solved(input: ReturnType<typeof makeInput>): Roster {
  const result = makeRoster(input, highs, TEST_META)
  if (!result.ok) throw new Error('the fixture must solve')
  return result.roster
}

describe('editRoster', () => {
  const MON = '2026-10-26'
  const input = makeInput({ teachers: 4, nannies: 3, groups: 2, days: [MON] })
  const base = solved(input)
  const seated = base.assignments.filter((a) => a.seat?.kind === 'teacher')

  it('accepts a swap that keeps every rule, marks the roster edited and explains it again', () => {
    const result = editRoster(input, base, {
      date: MON,
      a: seated[0].staffId,
      b: seated[1].staffId,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.roster.edited).toBe(true)
    expect(validateRoster(input, result.roster)).toEqual([])
    expect(Array.isArray(result.roster.warnings)).toBe(true)
  })

  it('stores the edited roster’s own deltas', () => {
    const result = editRoster(input, base, {
      date: MON,
      a: seated[0].staffId,
      b: seated[1].staffId,
    })
    if (!result.ok) throw new Error('must be accepted')
    expect(result.roster.balance).toEqual(balanceOf(input, result.roster))
  })

  it('refuses a swap that breaks a strict rule, and says which', () => {
    const opener = base.assignments.find((a) => a.opener)!
    const result = editRoster(input, base, { date: MON, a: opener.staffId, b: seated[0].staffId })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.violations.map((v) => v.rule)).toContain('keyNotNanny')
  })
})

// PROPERTY_RUNS=300 npm test -- edit   for a deep run before a release.
const RUNS = Number(process.env.PROPERTY_RUNS ?? 25)

describe('random swaps on random periods', () => {
  for (let seed = 1; seed <= RUNS; seed++) {
    it(`seed ${seed}: never a broken roster; swapping back restores it`, () => {
      const input = randomInput(seed)
      const roster = solved(input)
      const random = seededRandom(seed * 7919)
      for (const date of roster.period.days) {
        const working = roster.assignments.filter((x) => x.date === date)
        if (working.length < 2) continue
        const i = Math.floor(random() * working.length)
        const j = (i + 1 + Math.floor(random() * (working.length - 1))) % working.length
        const swap = { date, a: working[i].staffId, b: working[j].staffId }
        const result = editRoster(input, roster, swap)
        if (result.ok) {
          expect(validateRoster(input, result.roster)).toEqual([])
          expect(swapDay(result.roster, input.staff, swap).assignments).toEqual(roster.assignments)
        } else {
          expect(result.violations.length).toBeGreaterThan(0)
        }
      }
    })
  }
})
