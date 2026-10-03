import type { LegacyHighs } from 'highs'
import { toLpText, type Row } from './lp'
import {
  INTEGRAL_STAGES,
  STAGES,
  buildModel,
  groupNumbers,
  v,
  type RosterModel,
  type Stage,
} from './model'
import { anchorModel } from './recalc'
import {
  SHIFTS,
  type Anchor,
  type Assignment,
  type Hole,
  type Roster,
  type RosterMeta,
  type SolveInput,
} from './types'

/** The part of the `highs` module the solver needs; tests may pass a stub. */
export type LpSolver = Pick<LegacyHighs, 'solve'>

/** Fixed seed and proven optima at every stage: the same input gives the same roster. */
export const HIGHS_OPTIONS = { random_seed: 0, mip_rel_gap: 0, output_flag: false } as const

/**
 * Seconds per stage. Realistic weeks need about 3 s in all (6–7 s in a browser), the slowest stage
 * under 2 s; 15 s leaves room for a slow or busy laptop. A stage that runs out keeps the best
 * roster found so far, the roster says so (`stoppedEarly`), and the later stages still run, held
 * to what that roster reached.
 */
export const STAGE_TIME_LIMIT = 15

/**
 * Seconds for the year-balance tie-break. Its leftover carries into next week's balance anyway,
 * and on a big week HiGHS finds its roster in seconds yet may never prove it the best (6 groups:
 * not in 900 s, 2026-10-02). So it gets less time, and running out of it is no stopping early.
 */
export const YEARLY_TIME_LIMIT = 10

/** Slack when a fractional optimum becomes the next stage's bound; far below any real difference. */
const TOLERANCE = 1e-6

export class SolveError extends Error {
  constructor(
    readonly stage: Stage,
    readonly status: string,
  ) {
    super(`Solver stage "${stage}" ended with status "${status}"`)
    this.name = 'SolveError'
  }
}

type Columns = Record<string, { Primal?: number }>

/**
 * Staged solve (§6.5): each stage's optimum becomes a bound for the next, so a
 * later stage only chooses among rosters tied on every earlier one. With an anchor (a week in
 * progress), `input` must come from `recalcInput`.
 */
export function solve(
  input: SolveInput,
  highs: LpSolver,
  meta: RosterMeta,
  anchor?: Anchor,
): Roster {
  const model = buildModel(input)
  if (anchor) anchorModel(model, anchor)
  const bounds: Row[] = []
  let columns: Columns | undefined
  let stoppedEarly: Stage | undefined
  for (const stage of STAGES) {
    const objective = model.objectives[stage]
    if (objective.isEmpty()) continue
    const lp = toLpText(model.milp, objective, bounds)
    const timeLimit = stage === 'yearly' ? YEARLY_TIME_LIMIT : STAGE_TIME_LIMIT
    const options = { ...HIGHS_OPTIONS, time_limit: timeLimit }
    let result = highs.solve(lp, options)
    // A later stage is feasible by construction: the previous stage's roster meets every bound.
    // "Infeasible" there is HiGHS's presolve misjudging a bound that leaves only TOLERANCE of room
    // (seen on real data, 2026-09-28), so the stage is solved again without presolve.
    if (result.Status === 'Infeasible' && columns) {
      result = highs.solve(lp, { ...options, presolve: 'off' })
    }
    let value: number
    if (result.Status === 'Optimal') {
      columns = result.Columns
      value = result.ObjectiveValue
    } else if (result.Status === 'Time limit reached') {
      // Out of time: every rule is a constraint, so the best roster found so far is valid.
      if (hasSolution(result)) columns = result.Columns
      if (!columns) throw new SolveError(stage, result.Status)
      if (stage !== 'yearly') stoppedEarly ??= stage
      // The later stages still run, held to what this roster reached here.
      value = valueOf(objective.terms, columns)
    } else {
      throw new SolveError(stage, result.Status)
    }
    const rhs = INTEGRAL_STAGES.has(stage) ? Math.round(value) : value + TOLERANCE
    bounds.push({ terms: objective.terms, op: '<=', rhs })
  }
  const roster = decode(input, model, columns ?? {}, meta)
  return stoppedEarly ? { ...roster, stoppedEarly } : roster
}

/** Stopped before finding any roster, HiGHS reports an infinite objective yet fills every column. */
function hasSolution(result: { ObjectiveValue: number; Columns: Columns }): boolean {
  return Number.isFinite(result.ObjectiveValue) && Object.keys(result.Columns).length > 0
}

/** An objective's value on a solution (without its constant, as the LP text has it). */
function valueOf(terms: Map<string, number>, columns: Columns): number {
  let value = 0
  for (const [name, coef] of terms) value += coef * (columns[name]?.Primal ?? 0)
  return value
}

function decode(input: SolveInput, model: RosterModel, columns: Columns, meta: RosterMeta): Roster {
  const on = (name: string) => (columns[name]?.Primal ?? 0) > 0.5
  const assignments: Assignment[] = []
  const holes: Hole[] = []
  for (const day of model.days) {
    const d = day.index
    const groups = groupNumbers(day.groups)
    for (const p of day.present) {
      const assignment: Assignment = {
        staffId: model.people[p].id,
        date: day.date,
        shift: on(v.shift(p, d, 'morning')) ? 'morning' : 'afternoon',
      }
      for (const g of groups) {
        for (const t of SHIFTS) {
          if (on(v.teacherSeat(p, d, g, t)))
            assignment.seat = { kind: 'teacher', group: g, shift: t }
        }
        if (on(v.nannySeat(p, d, g))) assignment.seat = { kind: 'nanny', group: g }
        if (on(v.substitution(p, d, g))) {
          assignment.seat = { kind: 'nanny', group: g }
          assignment.substitution = true
        }
      }
      if (on(v.open(p, d))) assignment.opener = true
      if (on(v.close(p, d))) assignment.closer = true
      assignments.push(assignment)
    }
    for (const g of groups) {
      for (const t of SHIFTS) {
        if (on(v.holeTeacher(d, g, t))) {
          holes.push({ kind: 'teacherSeat', date: day.date, group: g, shift: t })
        }
      }
    }
    if (on(v.holeOpen(d))) holes.push({ kind: 'opener', date: day.date })
    if (on(v.holeClose(d))) holes.push({ kind: 'closer', date: day.date })
  }
  return {
    period: input.period,
    groupsPerDay: Object.fromEntries(model.capacities.map((c) => [c.date, c.groups])),
    assignments,
    holes,
    warnings: [],
    ...meta,
  }
}
