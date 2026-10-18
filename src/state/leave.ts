import type { Absence, Staff } from '../core/types'

/**
 * Leave days taken in a calendar year (Hungarian leave is counted per calendar year) against the
 * yearly allowance plus the days she typed in as carried over into that year. With `until`, only
 * the days up to and including it count: the balance as it stood that day.
 */
export function leaveBalance(
  absences: Absence[],
  person: Staff,
  year: string,
  until?: string,
): { used: number; total: number; remaining: number } {
  const used = absences.filter(
    (a) =>
      a.staffId === person.id &&
      a.kind === 'leave' &&
      a.date.startsWith(`${year}-`) &&
      (until === undefined || a.date <= until),
  ).length
  const total = (person.leaveAllowance ?? 0) + (person.leaveCarry?.[year] ?? 0)
  return { used, total, remaining: total - used }
}
