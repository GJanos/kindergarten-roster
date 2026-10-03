import loadHighs from 'highs'
import { describe, expect, it } from 'vitest'
import { TEST_META, makeInput, randomInput } from './fixtures'
import {
  STAGE_TIME_LIMIT,
  SolveError,
  YEARLY_TIME_LIMIT,
  solve,
  type LpSolver,
} from '../../src/core/solve'
import { balanceOf } from '../../src/core/fairness'
import type { Roster, SolveInput } from '../../src/core/types'
import { validateRoster } from '../../src/core/validate'

const highs = await loadHighs()

describe('solve', () => {
  it('gives the same roster for the same input', () => {
    const input = randomInput(7)
    expect(solve(input, highs, TEST_META)).toEqual(solve(input, highs, TEST_META))
  })

  it('says nothing about stopping early when every stage finished', () => {
    expect(solve(randomInput(7), highs, TEST_META).stoppedEarly).toBeUndefined()
  })

  it('returns an empty roster when every day is closed', () => {
    const input = makeInput({
      teachers: 2,
      nannies: 2,
      groups: 1,
      overrides: { '2026-10-26': 0 },
      days: ['2026-10-26'],
    })
    const roster = solve(input, highs, TEST_META)
    expect(roster.assignments).toEqual([])
    expect(roster.groupsPerDay).toEqual({ '2026-10-26': 0 })
  })

  it('keeps the best roster so far when a stage runs out of time, and still runs the rest', () => {
    let calls = 0
    const slow: LpSolver = {
      solve: (lp, options) => {
        calls += 1
        if (calls === 3)
          return { Status: 'Time limit reached', ObjectiveValue: 0, Columns: {}, Rows: [] }
        return highs.solve(lp, options)
      },
    }
    const input = makeInput({ teachers: 4, nannies: 3, groups: 2 })
    const roster = solve(input, slow, TEST_META)
    expect(calls).toBe(5) // holes, worstGap, totalGap (ran out), switches, turnarounds
    expect(roster.stoppedEarly).toBe('totalGap')
    expect(validateRoster(input, roster)).toEqual([])
  })

  it('never lets a later stage undo what a stage that ran out of time had', () => {
    // Stages 2–3 find nothing in time: the stages after them keep the fairness they were handed.
    const outAt = (stages: number[]): LpSolver => {
      let calls = 0
      return {
        solve: (lp, options) => {
          calls += 1
          if (stages.includes(calls))
            return { Status: 'Time limit reached', ObjectiveValue: 0, Columns: {}, Rows: [] }
          return highs.solve(lp, options)
        },
      }
    }
    for (let seed = 1; seed <= 12; seed++) {
      const input = randomInput(seed)
      const gaps = (roster: Roster) =>
        Object.values(balanceOf(input, roster))
          .flatMap((kinds) => Object.values(kinds))
          .reduce((sum, delta) => sum + Math.abs(delta), 0)
      const handed = solve(input, outAt([2, 3, 4, 5, 6, 7, 8, 9, 10]), TEST_META)
      const roster = solve(input, outAt([2, 3]), TEST_META)
      expect(validateRoster(input, roster)).toEqual([])
      expect(gaps(roster), `seed ${seed}`).toBeLessThanOrEqual(gaps(handed) + 1e-6)
    }
  })

  it('gives the year balance a shorter limit, and its running out is no stopping early', () => {
    // Its leftover carries into next week, and HiGHS can take forever to prove it (2026-10-02).
    const limits: number[] = []
    const yearlyOut: LpSolver = {
      solve: (lp, options) => {
        limits.push(Number(options?.time_limit))
        const result = highs.solve(lp, options)
        if (limits.length < 6 || result.Status !== 'Optimal') return result
        // Out of time with the roster it found, as HiGHS reports it.
        const Columns = Object.fromEntries(
          Object.entries(result.Columns).map(([name, column]) => [
            name,
            { ...column, Primal: column.Primal },
          ]),
        )
        return {
          Status: 'Time limit reached',
          ObjectiveValue: result.ObjectiveValue,
          Columns,
          Rows: [],
        }
      },
    }
    const input: SolveInput = {
      ...makeInput({ teachers: 4, nannies: 3, groups: 2 }),
      history: { t1: { morning: 0.5 }, t2: { morning: -0.5 } },
    }
    const roster = solve(input, yearlyOut, TEST_META)
    expect(limits).toHaveLength(6) // holes, worstGap, totalGap, switches, turnarounds, yearly
    expect(limits.slice(0, 5).every((limit) => limit === STAGE_TIME_LIMIT)).toBe(true)
    expect(limits[5]).toBe(YEARLY_TIME_LIMIT)
    expect(YEARLY_TIME_LIMIT).toBeLessThan(STAGE_TIME_LIMIT)
    expect(roster.stoppedEarly).toBeUndefined()
    expect(validateRoster(input, roster)).toEqual([])
  })

  it('ignores a stage that ran out of time before finding any roster', () => {
    // Real HiGHS then reports an infinite objective, yet still puts a number in every column.
    let calls = 0
    const empty: LpSolver = {
      solve: (lp, options) => {
        const result = highs.solve(lp, options)
        calls += 1
        if (calls < 3) return result
        const Columns = Object.fromEntries(
          Object.entries(result.Columns).map(([name, column]) => [name, { ...column, Primal: 0 }]),
        )
        return { Status: 'Time limit reached', ObjectiveValue: Infinity, Columns, Rows: [] }
      },
    }
    const input = makeInput({ teachers: 4, nannies: 3, groups: 2 })
    expect(validateRoster(input, solve(input, empty, TEST_META))).toEqual([])
  })

  it('solves a later stage again without presolve when HiGHS wrongly calls it infeasible', () => {
    // Seen on real data (2026-09-28): the yearly stage "Infeasible" although the previous stage's
    // roster met every bound; without presolve the same stage solved at once.
    const presolveFlags: (string | undefined)[] = []
    const misfiring: LpSolver = {
      solve: (lp, options) => {
        presolveFlags.push(options?.presolve)
        if (presolveFlags.length === 3 && options?.presolve !== 'off')
          return { Status: 'Infeasible', ObjectiveValue: Infinity, Columns: {}, Rows: [] }
        return highs.solve(lp, options)
      },
    }
    const input = makeInput({ teachers: 4, nannies: 3, groups: 2 })
    const roster = solve(input, misfiring, TEST_META)
    expect(presolveFlags[3]).toBe('off') // the third stage, asked again
    expect(roster.stoppedEarly).toBeUndefined()
    expect(roster).toEqual(solve(input, highs, TEST_META))
  })

  it('still fails loudly when a later stage stays infeasible without presolve', () => {
    let calls = 0
    const broken: LpSolver = {
      solve: (lp, options) => {
        calls += 1
        if (calls >= 3)
          return { Status: 'Infeasible', ObjectiveValue: Infinity, Columns: {}, Rows: [] }
        return highs.solve(lp, options)
      },
    }
    expect(() =>
      solve(makeInput({ teachers: 4, nannies: 3, groups: 2 }), broken, TEST_META),
    ).toThrow(SolveError)
  })

  it('fails loudly when the first stage finds nothing', () => {
    const broken: LpSolver = {
      solve: () => ({ Status: 'Time limit reached', ObjectiveValue: 0, Columns: {}, Rows: [] }),
    }
    expect(() =>
      solve(makeInput({ teachers: 2, nannies: 2, groups: 1 }), broken, TEST_META),
    ).toThrow(SolveError)
  })
})
