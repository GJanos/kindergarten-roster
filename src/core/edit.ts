import { explain } from './explain'
import { balanceOf } from './fairness'
import type { RosterResult } from './pipeline'
import type { Assignment, Roster, SolveInput, Staff } from './types'
import { validateRoster } from './validate'

/** Two people who both work on `date` (staff ids). */
export type Swap = { date: string; a: string; b: string }

/**
 * Exchanges two people's day: shift, seat, opener and closer. `substitution` follows the new
 * holder's role (a teacher in a nanny seat), so the result reads like a solver roster. Checks no
 * rule — `editRoster` does that.
 */
export function swapDay(roster: Roster, staff: Staff[], swap: Swap): Roster {
  const { date, a, b } = swap
  if (a === b) throw new Error('A swap needs two different people')
  const role = new Map(staff.map((s) => [s.id, s.role]))
  const dayOf = (staffId: string) => {
    const found = roster.assignments.find((x) => x.staffId === staffId && x.date === date)
    if (!found) throw new Error(`${staffId} does not work on ${date}`)
    return found
  }
  const first = dayOf(a)
  const second = dayOf(b)
  const takeOver = (holder: Assignment, from: Assignment): Assignment => {
    const next: Assignment = { staffId: holder.staffId, date, shift: from.shift }
    if (from.seat) next.seat = from.seat
    if (from.seat?.kind === 'nanny' && role.get(holder.staffId) === 'teacher') {
      next.substitution = true
    }
    if (from.opener) next.opener = true
    if (from.closer) next.closer = true
    return next
  }
  return {
    ...roster,
    assignments: roster.assignments.map((x) =>
      x === first ? takeOver(first, second) : x === second ? takeOver(second, first) : x,
    ),
  }
}

/**
 * A swap through the same gate as a solve: every strict rule re-checked, the warnings explained
 * again. A roster that breaks a rule never comes back — the caller shows why instead.
 */
export function editRoster(input: SolveInput, roster: Roster, swap: Swap): RosterResult {
  const swapped = swapDay(roster, input.staff, swap)
  const violations = validateRoster(input, swapped)
  if (violations.length > 0) return { ok: false, violations }
  return {
    ok: true,
    roster: {
      ...swapped,
      edited: true,
      warnings: explain(input, swapped),
      balance: balanceOf(input, swapped),
    },
  }
}
