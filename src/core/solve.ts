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
import {
  SHIFTS,
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

/** Seconds per stage. A stage that runs out keeps the best roster found so far. */
export const STAGE_TIME_LIMIT = 4

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
 * later stage only chooses among rosters tied on every earlier one.
 */
export function solve(input: SolveInput, highs: LpSolver, meta: RosterMeta): Roster {
  const model = buildModel(input)
  const bounds: Row[] = []
  let columns: Columns | undefined
  for (const stage of STAGES) {
    const objective = model.objectives[stage]
    if (objective.isEmpty()) continue
    const lp = toLpText(model.milp, objective, bounds)
    const result = highs.solve(lp, { ...HIGHS_OPTIONS, time_limit: STAGE_TIME_LIMIT })
    if (result.Status === 'Optimal') {
      columns = result.Columns
      const optimum = result.ObjectiveValue
      const rhs = INTEGRAL_STAGES.has(stage) ? Math.round(optimum) : optimum + TOLERANCE
      bounds.push({ terms: objective.terms, op: '<=', rhs })
      continue
    }
    // Out of time: every rule is a constraint, so the best roster found so far is valid.
    if (result.Status === 'Time limit reached') {
      if (hasSolution(result)) columns = result.Columns
      if (columns) break
    }
    throw new SolveError(stage, result.Status)
  }
  return decode(input, model, columns ?? {}, meta)
}

/** Stopped before finding any roster, HiGHS reports an infinite objective yet fills every column. */
function hasSolution(result: { ObjectiveValue: number; Columns: Columns }): boolean {
  return Number.isFinite(result.ObjectiveValue) && Object.keys(result.Columns).length > 0
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
