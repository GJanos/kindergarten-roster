import { describe, expect, it } from 'vitest'
import { TEST_META, makeStaff } from '../core/fixtures'
import type { Assignment, Roster } from '../../src/core/types'
import { changedCells } from '../../src/ui/changedCells'

const MON = '2026-10-26'
const TUE = '2026-10-27'
const staff = makeStaff(3, 2)

function roster(assignments: Assignment[], groups = 1): Roster {
  return {
    period: { start: MON, days: [MON, TUE] },
    groupsPerDay: { [MON]: groups, [TUE]: groups },
    assignments,
    holes: [],
    warnings: [],
    ...TEST_META,
  }
}

const teacher = (staffId: string, date: string, group = 1): Assignment => ({
  staffId,
  date,
  shift: 'morning',
  seat: { kind: 'teacher', group, shift: 'morning' },
})

describe('changedCells', () => {
  it('finds nothing when the roster is the same', () => {
    const r = roster([teacher('t1', MON), teacher('t1', TUE)])
    expect(changedCells(r, r, staff)).toEqual(new Set())
  })

  it('marks the cells whose content changed, as row|date keys', () => {
    const before = roster([teacher('t1', MON), teacher('t1', TUE)])
    const after = roster([teacher('t1', MON), teacher('t2', TUE)])
    expect(changedCells(before, after, staff)).toEqual(new Set([`0|${TUE}`]))
  })

  it('matches rows by name, so a reserve row moved down by a new group still compares', () => {
    const reserve: Assignment = { staffId: 't3', date: MON, shift: 'morning' }
    const before = roster([teacher('t1', MON), reserve])
    const after = roster([teacher('t1', MON), teacher('t2', MON, 2), reserve], 2)
    const keys = changedCells(before, after, staff)
    expect(keys.has(`1|${MON}`)).toBe(true) // the new 2nd group
    expect(keys.has(`2|${MON}`)).toBe(false) // reserve teachers: same as before
  })

  it('marks nothing without an earlier roster', () => {
    expect(changedCells(undefined, roster([teacher('t1', MON)]), staff)).toEqual(new Set())
  })
})
