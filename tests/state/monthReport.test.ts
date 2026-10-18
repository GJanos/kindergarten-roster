import { describe, expect, it } from 'vitest'
import type { Absence, AbsenceKind, Staff } from '../../src/core/types'
import { monthReport } from '../../src/state/monthReport'

const person = (id: string, displayName: string, role: Staff['role'], more: Partial<Staff> = {}) =>
  ({ id, fullName: displayName, displayName, role, active: true, ...more }) satisfies Staff

const staff: Staff[] = [
  person('n', 'Nóra', 'nanny'),
  person('b', 'Bea', 'teacher', { leaveAllowance: 20, leaveCarry: { '2026': 2 } }),
  person('a', 'Anna', 'teacher'),
  person('o', 'Ottó', 'nanny', { active: false }), // left, but away this month
  person('g', 'Gizi', 'teacher', { deleted: true }), // deleted, but away this month
  person('r', 'Rita', 'nanny', { active: false }), // left, nothing this month
]
const away = (staffId: string, date: string, kind: AbsenceKind): Absence => ({
  staffId,
  date,
  kind,
})
const absences: Absence[] = [
  away('b', '2026-09-14', 'leave'), // last month: only in the balance
  away('b', '2026-10-06', 'leave'),
  away('b', '2026-10-07', 'leave'),
  away('b', '2026-10-08', 'leave'),
  away('b', '2026-10-20', 'sick'),
  away('b', '2026-10-21', 'other'),
  away('b', '2026-11-03', 'leave'), // next month: not in October's balance
  away('a', '2026-10-11', 'sick'), // a Sunday: not a working day
  away('o', '2026-10-12', 'sick'),
  away('g', '2026-10-13', 'leave'),
]

describe('monthReport', () => {
  const rows = monthReport(absences, staff, '2026-10')

  it('lists teachers then nannies by name, including anyone gone who was away that month', () => {
    expect(rows.map((r) => r.name)).toEqual(['Anna', 'Bea', 'Gizi', 'Nóra', 'Ottó'])
  })

  it("counts the month's working days by kind, with the dates", () => {
    const bea = rows.find((r) => r.staffId === 'b')!
    expect(bea.counts).toEqual({ leave: 3, sick: 1, other: 1 })
    expect(bea.total).toBe(5)
    expect(bea.dates).toEqual([
      '2026-10-06',
      '2026-10-07',
      '2026-10-08',
      '2026-10-20',
      '2026-10-21',
    ])
  })

  it('gives the leave left at the end of the month, ignoring later leave', () => {
    expect(rows.find((r) => r.staffId === 'b')!.leaveLeft).toBe(22 - 4)
  })

  it('shows zeros and no balance for someone with nothing that month and no allowance', () => {
    const anna = rows.find((r) => r.staffId === 'a')!
    expect(anna).toMatchObject({ counts: { leave: 0, sick: 0, other: 0 }, total: 0, dates: [] })
    expect(anna.leaveLeft).toBeUndefined()
  })
})
