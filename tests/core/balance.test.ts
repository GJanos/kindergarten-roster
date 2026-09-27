import { describe, expect, it } from 'vitest'
import { TEST_META, makeInput } from './fixtures'
import type { Roster } from '../../src/core/types'
import { balanceOf } from '../../src/core/fairness'

const WED = '2026-10-28'
// 2 teachers, 2 nannies, 1 group: every fair share is ½.
const input = makeInput({ teachers: 2, nannies: 2, groups: 1, days: [WED] })
const roster: Roster = {
  period: input.period,
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
    { staffId: 'n1', date: WED, shift: 'morning', seat: { kind: 'nanny', group: 1 }, opener: true },
    { staffId: 'n2', date: WED, shift: 'afternoon', closer: true },
  ],
  holes: [],
  warnings: [],
  ...TEST_META,
}

describe('balanceOf', () => {
  it("gives each person's count minus fair share, per kind", () => {
    expect(balanceOf(input, roster)).toEqual({
      t1: { morning: 0.5, reserve: 0 },
      t2: { morning: -0.5, reserve: 0 },
      n1: { morning: 0.5, reserve: -0.5, opener: 0.5, closer: -0.5 },
      n2: { morning: -0.5, reserve: 0.5, opener: -0.5, closer: 0.5 },
    })
  })
})
