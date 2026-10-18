import { describe, expect, it } from 'vitest'
import type { Absence, Staff } from '../../src/core/types'
import { carryPatch, leaveBalance } from '../../src/state/leave'

const anna: Staff = {
  id: 'a',
  fullName: 'Kiss Anna',
  displayName: 'Anna',
  role: 'teacher',
  active: true,
  leaveAllowance: 50,
  leaveCarry: { '2026': 3 },
}
const absences: Absence[] = [
  { staffId: 'a', date: '2025-12-30', kind: 'leave' }, // last year
  { staffId: 'a', date: '2026-10-26', kind: 'leave' },
  { staffId: 'a', date: '2026-10-27', kind: 'leave' },
  { staffId: 'a', date: '2026-10-28', kind: 'sick' }, // not leave
  { staffId: 'b', date: '2026-10-26', kind: 'leave' }, // someone else
]

describe('leaveBalance', () => {
  it("counts the calendar year's leave days against allowance plus carry-over", () => {
    expect(leaveBalance(absences, anna, '2026')).toEqual({ used: 2, total: 53, remaining: 51 })
    expect(leaveBalance(absences, anna, '2025')).toEqual({ used: 1, total: 50, remaining: 49 })
  })

  it('counts only the days up to `until`, so a month-end figure ignores later leave', () => {
    expect(leaveBalance(absences, anna, '2026', '2026-10-26')).toEqual({
      used: 1,
      total: 53,
      remaining: 52,
    })
    expect(leaveBalance(absences, anna, '2026', '2026-09-30').remaining).toBe(53)
  })

  it('goes below zero past the allowance', () => {
    const tight: Staff = { ...anna, leaveAllowance: 1, leaveCarry: undefined }
    expect(leaveBalance(absences, tight, '2026').remaining).toBe(-1)
  })
})

describe('carryPatch', () => {
  it("sets one year's carry-over and keeps the other years", () => {
    const both: Staff = { ...anna, leaveCarry: { '2025': 2, '2026': 3 } }
    expect(carryPatch(both, '2026', '5')).toEqual({ leaveCarry: { '2025': 2, '2026': 5 } })
    expect(carryPatch(both, '2026', '')).toEqual({ leaveCarry: { '2025': 2 } })
  })

  it('rounds, and drops zero, below zero and empty, leaving no empty record', () => {
    expect(carryPatch(anna, '2026', '2.6')).toEqual({ leaveCarry: { '2026': 3 } })
    expect(carryPatch(anna, '2026', '0')).toEqual({ leaveCarry: undefined })
    expect(carryPatch(anna, '2026', '-4')).toEqual({ leaveCarry: undefined })
    expect(carryPatch(anna, '2026', '')).toEqual({ leaveCarry: undefined })
  })
})
