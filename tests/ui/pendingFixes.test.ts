import { describe, expect, it } from 'vitest'
import { emptyState, reducer, type Action, type AppState } from '../../src/state/appState'
import { fixActions, toggleFix } from '../../src/ui/pendingFixes'
import type { DayFix } from '../../src/ui/warningDays'

const WEEK = '2026-10-26'
const [TUE, FRI] = ['2026-10-27', '2026-10-30']
const anna: DayFix = { kind: 'callIn', date: TUE, staffId: 'a', name: 'Anna' }
const bea: DayFix = { kind: 'callIn', date: TUE, staffId: 'b', name: 'Bea' }
const two: DayFix = { kind: 'setGroups', date: FRI, groups: 2 }
const one: DayFix = { kind: 'setGroups', date: FRI, groups: 1 }

describe('toggleFix', () => {
  it('selects, and a second click deselects', () => {
    expect(toggleFix([], anna)).toEqual([anna])
    expect(toggleFix([anna], anna)).toEqual([])
  })

  it('adds call-ins up, but keeps one group count a day', () => {
    expect(toggleFix([anna], bea)).toEqual([anna, bea])
    expect(toggleFix([anna, two], one)).toEqual([anna, one])
  })
})

describe('fixActions', () => {
  const state: AppState = (
    [
      { type: 'addStaff', id: 'a' },
      { type: 'setAbsent', staffId: 'a', dates: [TUE], absent: true, kind: 'sick' },
    ] as Action[]
  ).reduce(reducer, emptyState())

  it('labels one fix as before', () => {
    expect(fixActions(state, WEEK, [anna]).label).toBe('Anna mégis jön kedden.')
  })

  it('applies them all, and undoes them all, the absence back as it was', () => {
    const { actions, inverse, label } = fixActions(state, WEEK, [anna, two])
    expect(label).toBe('2 változtatás: Anna mégis jön kedden · Pénteken 2 csoport beállítva.')
    const applied = actions.reduce(reducer, state)
    expect(applied.absences).toEqual([])
    const undone = inverse.reduce(reducer, applied)
    expect(undone.absences).toEqual(state.absences)
    expect(undone.periods[WEEK]?.dayPlans.find((d) => d.date === FRI)?.override).toBeUndefined()
  })
})
