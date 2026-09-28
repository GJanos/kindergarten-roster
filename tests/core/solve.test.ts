import loadHighs from 'highs'
import { describe, expect, it } from 'vitest'
import { TEST_META, makeInput, randomInput } from './fixtures'
import { SolveError, solve, type LpSolver } from '../../src/core/solve'
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

  it('keeps the best roster so far when a later stage runs out of time', () => {
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
    expect(calls).toBe(3)
    expect(roster.stoppedEarly).toBe('totalGap') // holes, worstGap, then this one ran out
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
