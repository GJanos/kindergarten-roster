import { explain } from './explain'
import { balanceOf } from './fairness'
import type { RosterResult } from './pipeline'
import { recalcInput } from './recalc'
import type { Assignment, Roster, Shift, SolveInput, Staff } from './types'
import { validateRoster } from './validate'

/** Two people who both work on `date` (staff ids). */
export type Swap = { date: string; a: string; b: string }

/** A helper's hours by hand (v3-c): 8–16, 6–14 or 10–18. */
export type ShiftChange = { date: string; staffId: string; shift: Shift }

/**
 * Exchanges two people's day: shift, seat, opener, closer and ügyelet. `substitution` follows the
 * new holder's role (someone in another role's seat), so the result reads like a solver roster.
 * Checks no rule — `editRoster` does that.
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
    const own = role.get(holder.staffId)
    if (
      (from.seat?.kind === 'nanny' && own !== 'nanny') ||
      (from.seat?.kind === 'teacher' && own !== 'teacher')
    ) {
      next.substitution = true
    }
    if (from.opener) next.opener = true
    if (from.closer) next.closer = true
    if (from.duty) next.duty = true // ügyelet belongs to the seat
    return next
  }
  return {
    ...roster,
    assignments: roster.assignments.map((x) =>
      x === first ? takeOver(first, second) : x === second ? takeOver(second, first) : x,
    ),
  }
}

/** Sets one person's hours, keeping seat, keys and ügyelet. Checks no rule — `editShift` does. */
export function setShift(roster: Roster, change: ShiftChange): Roster {
  const { date, staffId, shift } = change
  const at = (a: Assignment) => a.staffId === staffId && a.date === date
  if (!roster.assignments.some(at)) throw new Error(`${staffId} does not work on ${date}`)
  return { ...roster, assignments: roster.assignments.map((a) => (at(a) ? { ...a, shift } : a)) }
}

/**
 * A hand edit through the same gate as a solve: every strict rule re-checked, the warnings
 * explained again. A roster that breaks a rule never comes back — the caller shows why instead.
 * With `from` (a week in progress) the days before it are history, checked the way `makeRoster`
 * checks them: as they were worked, not against absences or group counts set since.
 */
function gate(
  input: SolveInput,
  roster: Roster,
  from: string | undefined,
  change: (staff: Staff[]) => Roster,
): RosterResult {
  const checked = (from && recalcInput(input, { roster, from, mode: 'minimal' })) || input
  const next = change(checked.staff)
  const violations = validateRoster(checked, next)
  if (violations.length > 0) return { ok: false, violations }
  return {
    ok: true,
    roster: {
      ...next,
      edited: true,
      warnings: explain(checked, next),
      balance: balanceOf(checked, next),
    },
  }
}

export function editRoster(input: SolveInput, roster: Roster, swap: Swap, from?: string) {
  return gate(input, roster, from, (staff) => swapDay(roster, staff, swap))
}

/** A helper's shift by hand (v3-c): like a swap, `edited`, and a re-solve drops it. */
export function editShift(input: SolveInput, roster: Roster, change: ShiftChange, from?: string) {
  return gate(input, roster, from, () => setShift(roster, change))
}
