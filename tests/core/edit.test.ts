import { describe, expect, it } from 'vitest'
import { TEST_META, makeStaff } from './fixtures'
import type { Roster } from '../../src/core/types'
import { swapDay } from '../../src/core/edit'

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
