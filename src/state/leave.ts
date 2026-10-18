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

/**
 * The patch that sets one year's typed carry-over, other years untouched. Empty or 0 clears it:
 * nothing carried over is stored as nothing, and shows as 0.
 */
export function carryPatch(person: Staff, year: string, value: string): Pick<Staff, 'leaveCarry'> {
  const carry = { ...person.leaveCarry }
  const days = value === '' ? 0 : Math.max(0, Math.round(Number(value)))
  if (days === 0) delete carry[year]
  else carry[year] = days
  return { leaveCarry: Object.keys(carry).length > 0 ? carry : undefined }
}
