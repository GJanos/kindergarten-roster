import loadHighs from 'highs'
import { describe, expect, it } from 'vitest'
import { TEST_META, consecutiveDays, makeInput } from './fixtures'
import { INTEGRAL_STAGES, buildModel } from '../../src/core/model'
import { solve } from '../../src/core/solve'
import type { Balance } from '../../src/core/types'

const highs = await loadHighs()
const WED = '2026-10-28'
// One day, one group, 2 teachers, 2 nannies: who opens, and who works mornings, are ties.
const day = (history?: Balance) => ({
  ...makeInput({ teachers: 2, nannies: 2, groups: 1, days: [WED] }),
  ...(history ? { history } : {}),
})
const opener = (history: Balance) =>
  solve(day(history), highs, TEST_META).assignments.find((a) => a.opener)?.staffId

describe('the yearly stage', () => {
  it('gives the opening to the nanny who has opened less this year', () => {
    expect(opener({ n1: { opener: 2 } })).toBe('n2')
    expect(opener({ n2: { opener: 2 } })).toBe('n1')
  })

  it('gives the morning to the teacher who has had fewer mornings', () => {
    const morningOf = (history: Balance) =>
      solve(day(history), highs, TEST_META).assignments.find(
        (a) => a.shift === 'morning' && a.seat?.kind === 'teacher',
      )?.staffId
    expect(morningOf({ t1: { morning: 1.5 } })).toBe('t2')
    expect(morningOf({ t2: { morning: 1.5 } })).toBe('t1')
  })

  it('never trades period fairness for the year', () => {
    // 3 days, 3 nannies: the fair share is exactly one opening each. n1 is far ahead this year,
    // yet still opens once — no strict rule forces that, only stages 3–4 coming first.
    const week = {
      ...makeInput({ teachers: 2, nannies: 3, groups: 1, days: consecutiveDays('2026-10-26', 3) }),
      history: { n1: { opener: 10 } },
    }
    const openings = solve(week, highs, TEST_META)
      .assignments.filter((a) => a.opener)
      .map((a) => a.staffId)
      .sort()
    expect(openings).toEqual(['n1', 'n2', 'n3'])
  })

  it('is skipped when there is no history', () => {
    expect(buildModel(day()).objectives.yearly.isEmpty()).toBe(true)
  })

  it('is a fractional stage: its optimum is never rounded into a bound', () => {
    expect(INTEGRAL_STAGES.has('yearly')).toBe(false)
  })
})
