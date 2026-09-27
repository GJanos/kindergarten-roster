import { describe, expect, it } from 'vitest'
import type { Absence, Staff } from '../../src/core/types'
import { leaveBalance } from '../../src/state/leave'

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
    expect(leaveBalance(absences, anna, '2026')).toEqual({ used: 2, total: 53 })
    expect(leaveBalance(absences, anna, '2025')).toEqual({ used: 1, total: 50 })
  })
})
