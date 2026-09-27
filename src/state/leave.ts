import type { Absence, Staff } from '../core/types'

/**
 * Leave days taken in a calendar year (Hungarian leave is counted per calendar year) against the
 * yearly allowance plus the days she typed in as carried over into that year.
 */
export function leaveBalance(
  absences: Absence[],
  person: Staff,
  year: string,
): { used: number; total: number } {
  const used = absences.filter(
    (a) => a.staffId === person.id && a.kind === 'leave' && a.date.startsWith(`${year}-`),
  ).length
  return { used, total: (person.leaveAllowance ?? 0) + (person.leaveCarry?.[year] ?? 0) }
}
