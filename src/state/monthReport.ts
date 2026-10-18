import { isWorkingDay } from '../core/calendar'
import { rosterOrder } from '../core/names'
import type { Absence, AbsenceKind, Role, Staff } from '../core/types'
import { leaveBalance } from './leave'

/** One person's month, as plain data: the print panel shows it, and an Excel sheet could. */
export type MonthReportRow = {
  staffId: string
  name: string
  role: Role
  counts: Record<AbsenceKind, number>
  total: number
  dates: string[] // the month's absent working days, sorted
  leaveLeft?: number // at the month's end; undefined when no allowance is set
}

/**
 * Who was away how many days in `month` ('2026-10'), for the accountant. Everyone active, plus
 * anyone inactive or deleted who was away that month, so the report stays true after they leave.
 */
export function monthReport(absences: Absence[], staff: Staff[], month: string): MonthReportRow[] {
  const inMonth = absences.filter((a) => a.date.startsWith(`${month}-`) && isWorkingDay(a.date))
  const away = new Set(inMonth.map((a) => a.staffId))
  const people = rosterOrder(staff.filter((s) => (s.active && !s.deleted) || away.has(s.id)))
  const year = month.slice(0, 4)
  return people.map((s) => {
    const byDate = new Map(inMonth.filter((a) => a.staffId === s.id).map((a) => [a.date, a.kind]))
    const counts: Record<AbsenceKind, number> = { leave: 0, sick: 0, other: 0 }
    for (const kind of byDate.values()) counts[kind]++
    return {
      staffId: s.id,
      name: s.displayName || s.fullName,
      role: s.role,
      counts,
      total: byDate.size,
      dates: [...byDate.keys()].sort(),
      // Every date of the month sorts at or before '-31'.
      leaveLeft:
        s.leaveAllowance === undefined
          ? undefined
          : leaveBalance(absences, s, year, `${month}-31`).remaining,
    }
  })
}
