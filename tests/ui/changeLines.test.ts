import { describe, expect, it } from 'vitest'
import { TEST_META, makeStaff } from '../core/fixtures'
import type { Assignment, Roster } from '../../src/core/types'
import { changeLines } from '../../src/ui/changeLines'

const WED = '2026-10-28'
const THU = '2026-10-29'
const staff = makeStaff(2, 1)
const roster = (assignments: Assignment[]): Roster => ({
  period: { start: WED, days: [WED, THU] },
  groupsPerDay: { [WED]: 1, [THU]: 1 },
  assignments,
  holes: [],
  warnings: [],
  ...TEST_META,
})
const before = roster([
  {
    staffId: 't1',
    date: WED,
    shift: 'morning',
    seat: { kind: 'teacher', group: 1, shift: 'morning' },
  },
  { staffId: 't2', date: WED, shift: 'afternoon' },
  { staffId: 't2', date: THU, shift: 'afternoon' },
  { staffId: 'n1', date: THU, shift: 'morning', opener: true },
])
// T1 is off sick; T2 covers her morning on Wednesday and comes in the morning on Thursday too.
const after = roster([
  {
    staffId: 't2',
    date: WED,
    shift: 'morning',
    seat: { kind: 'teacher', group: 1, shift: 'morning' },
  },
  { staffId: 't2', date: THU, shift: 'morning' },
  { staffId: 'n1', date: THU, shift: 'morning', opener: true },
])

describe('changeLines', () => {
  it("counts people, then lists each changed day, today's first", () => {
    expect(changeLines(before, after, WED, staff, WED)).toEqual([
      '1 munkatárs beosztása változott:',
      'T2: ma DE 7:00–13:30, 1. cs. (eddig DU 10:30–17:00, csoporton kívül)',
      'T2: csütörtökön DE 7:00–13:30, csoporton kívül (eddig DU 10:30–17:00, csoporton kívül)',
    ])
  })

  it('says so when nobody else changed', () => {
    expect(changeLines(before, before, WED, staff, WED)).toEqual([
      'Senki más beosztása nem változott.',
    ])
  })
})
