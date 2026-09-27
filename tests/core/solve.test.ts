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
    expect(validateRoster(input, roster)).toEqual([])
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
