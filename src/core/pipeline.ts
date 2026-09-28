import { explain } from './explain'
import { balanceOf } from './fairness'
import { recalcInput } from './recalc'
import { solve, type LpSolver } from './solve'
import type { Anchor, Roster, RosterMeta, SolveInput } from './types'
import { validateRoster, type Violation } from './validate'

export type RosterResult = { ok: true; roster: Roster } | { ok: false; violations: Violation[] }

/**
 * Solve, re-check every strict rule, then explain. A roster that fails the check is never shown.
 * With an anchor (a week in progress) the days before `anchor.from` stay as planned (§6.5).
 */
export function makeRoster(
  input: SolveInput,
  highs: LpSolver,
  meta: RosterMeta,
  anchor?: Anchor,
): RosterResult {
  const solveInput = anchor ? recalcInput(input, anchor) : input
  if (!solveInput) throw new Error('The roster to keep no longer fits this week')
  const roster = solve(solveInput, highs, meta, anchor)
  const violations = validateRoster(solveInput, roster)
  if (violations.length > 0) return { ok: false, violations }
  // Hand edits on the kept days stay, so the roster stays marked.
  const edited = anchor?.roster.edited ? { edited: true as const } : {}
  return {
    ok: true,
    roster: {
      ...roster,
      ...edited,
      warnings: explain(solveInput, roster),
      balance: balanceOf(solveInput, roster),
    },
  }
}
