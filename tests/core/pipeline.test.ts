import loadHighs from 'highs'
import { describe, expect, it } from 'vitest'
import { TEST_META, makeInput } from './fixtures'
import { makeRoster } from '../../src/core/pipeline'
import { balanceOf } from '../../src/core/fairness'
import type { LpSolver } from '../../src/core/solve'

const highs = await loadHighs()

describe('makeRoster', () => {
  it('returns a checked roster with its warnings', () => {
    const result = makeRoster(
      makeInput({ teachers: 3, nannies: 2, groups: 2, days: ['2026-10-28'] }),
      highs,
      TEST_META,
    )
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.roster.warnings.map((w) => w.code)).toContain('TEACHER_SEAT_EMPTY')
  })

  it('refuses a roster that breaks a strict rule', () => {
    // A solver that claims optimality but leaves every variable at zero.
    const liar: LpSolver = {
      solve: () => ({ Status: 'Optimal', ObjectiveValue: 0, Columns: {}, Rows: [] }),
    }
    const result = makeRoster(makeInput({ teachers: 2, nannies: 2, groups: 1 }), liar, TEST_META)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.violations.length).toBeGreaterThan(0)
  })

  it('stores the roster’s fairness deltas for the yearly balance', () => {
    const input = makeInput({ teachers: 4, nannies: 3, groups: 2, days: ['2026-10-28'] })
    const result = makeRoster(input, highs, TEST_META)
    if (!result.ok) throw new Error('must solve')
    expect(result.roster.balance).toEqual(balanceOf(input, result.roster))
  })
})
