import { explain } from './explain'
import { solve, type LpSolver } from './solve'
import type { Roster, RosterMeta, SolveInput } from './types'
import { validateRoster, type Violation } from './validate'

export type RosterResult = { ok: true; roster: Roster } | { ok: false; violations: Violation[] }

/** Solve, re-check every strict rule, then explain. A roster that fails the check is never shown. */
export function makeRoster(input: SolveInput, highs: LpSolver, meta: RosterMeta): RosterResult {
  const roster = solve(input, highs, meta)
  const violations = validateRoster(input, roster)
  if (violations.length > 0) return { ok: false, violations }
  return { ok: true, roster: { ...roster, warnings: explain(input, roster) } }
}
