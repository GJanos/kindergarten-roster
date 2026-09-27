import { describe, expect, it } from 'vitest'
import { emptyState, reducer, type Action, type AppState } from '../../src/state/appState'
import { inputKey, solveInputFor } from '../../src/state/solveInput'

const WEEK = '2026-10-26'
const run = (state: AppState, ...actions: Action[]) => actions.reduce(reducer, state)
const base = () =>
  run(
    emptyState(),
    { type: 'addStaff', id: 'a' },
    { type: 'addStaff', id: 'b' },
    { type: 'updateStaff', id: 'b', patch: { active: false } },
    { type: 'setAbsent', staffId: 'a', dates: ['2026-10-27', '2026-11-03'], absent: true },
  )

describe('solveInputFor', () => {
  it('takes the active staff and the week’s absences and days', () => {
    const input = solveInputFor(base(), WEEK)
    expect(input.staff.map((s) => s.id)).toEqual(['a'])
    expect(input.absences).toEqual([{ staffId: 'a', date: '2026-10-27' }])
    expect(input.period.days).toHaveLength(5)
    expect(input.dayPlans).toHaveLength(5)
  })

  it('carries the kindergarten year so far', () => {
    expect(solveInputFor(base(), WEEK).history).toEqual({})
  })
})

describe('inputKey', () => {
  it('ignores the yearly history, which is only a tie-break', () => {
    const key = inputKey(solveInputFor(base(), WEEK))
    const withHistory = { ...solveInputFor(base(), WEEK), history: { a: { morning: 3 } } }
    expect(inputKey(withHistory)).toBe(key)
  })

  it('changes with absences and group counts, not with names', () => {
    const key = inputKey(solveInputFor(base(), WEEK))
    const renamed = run(base(), { type: 'updateStaff', id: 'a', patch: { displayName: 'Anna' } })
    expect(inputKey(solveInputFor(renamed, WEEK))).toBe(key)
    const absent = run(base(), {
      type: 'setAbsent',
      staffId: 'a',
      dates: ['2026-10-28'],
      absent: true,
    })
    expect(inputKey(solveInputFor(absent, WEEK))).not.toBe(key)
    const groups = run(base(), { type: 'setGroups', week: WEEK, groups: 3 })
    expect(inputKey(solveInputFor(groups, WEEK))).not.toBe(key)
  })
})
