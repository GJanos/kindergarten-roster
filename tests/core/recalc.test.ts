import loadHighs from 'highs'
import { describe, expect, it } from 'vitest'
import { TEST_META, makeInput, randomInput } from './fixtures'
import { anchorModel, recalcInput, scheduleChanges } from '../../src/core/recalc'
import { buildModel, v } from '../../src/core/model'
import { makeRoster } from '../../src/core/pipeline'
import { demoState } from '../../src/demo/demoData'
import { solveInputFor } from '../../src/state/solveInput'
import { solve } from '../../src/core/solve'
import { validateRoster } from '../../src/core/validate'
import type { Anchor, Assignment, Roster, Shift } from '../../src/core/types'

const highs = await loadHighs()
const MON = '2026-10-26'
const TUE = '2026-10-27'
const WED = '2026-10-28'

// A three-day week, T4 on leave on Monday, solved once: the roster a recalculation keeps.
const week = makeInput({
  teachers: 4,
  nannies: 3,
  groups: 2,
  days: [MON, TUE, WED],
  absent: { t4: [MON] },
})
const planned = solve(week, highs, TEST_META)
const keeping = (from: string, roster: Roster = planned): Anchor => ({
  roster,
  from,
  mode: 'minimal',
})

describe('recalcInput', () => {
  it('changes nothing while no day is over', () => {
    expect(recalcInput(week, keeping(MON))).toEqual(week)
  })

  it('reads who worked a past day from the roster, not from absences typed since', () => {
    const typed = {
      ...week,
      absences: [
        ...week.absences,
        { staffId: 'n1', date: MON, kind: 'sick' as const },
        { staffId: 'n1', date: WED, kind: 'sick' as const },
      ],
    }
    const derived = recalcInput(typed, keeping(TUE))!
    expect(derived.absences.filter((a) => a.date === MON)).toEqual([
      { staffId: 't4', date: MON, kind: 'leave' },
    ])
    expect(derived.absences.filter((a) => a.date !== MON)).toEqual([
      { staffId: 'n1', date: WED, kind: 'sick' },
    ])
  })

  it("keeps a past day's group count even if its plan changed since", () => {
    const fewer = {
      ...week,
      dayPlans: week.dayPlans.map((p) => (p.date === MON ? { ...p, override: 1 } : p)),
    }
    const derived = recalcInput(fewer, keeping(TUE))!
    expect(derived.dayPlans[0]).toEqual({ date: MON, requestedGroups: 2, override: 2 })
    expect(derived.dayPlans.slice(1)).toEqual(fewer.dayPlans.slice(1))
  })

  it('keeps a past day closed when nobody worked it', () => {
    const closed = makeInput({
      teachers: 4,
      nannies: 3,
      groups: 2,
      days: [MON, TUE, WED],
      overrides: { [MON]: 0 },
    })
    const reopened = makeInput({ teachers: 4, nannies: 3, groups: 2, days: [MON, TUE, WED] })
    const derived = recalcInput(reopened, keeping(TUE, solve(closed, highs, TEST_META)))!
    expect(derived.dayPlans[0]).toEqual({ date: MON, requestedGroups: 2, override: 0 })
  })

  it('gives up on another period, or on a past day worked by someone no longer active', () => {
    const shorter = {
      ...week,
      period: { start: MON, days: [MON, TUE] },
      dayPlans: week.dayPlans.slice(0, 2),
    }
    expect(recalcInput(shorter, keeping(TUE))).toBeUndefined()
    const gone = {
      ...week,
      staff: week.staff.map((s) => (s.id === 'n1' ? { ...s, active: false } : s)),
    }
    expect(recalcInput(gone, keeping(TUE))).toBeUndefined()
  })
})

// One day, one group: the wall as it was planned before anyone called in sick.
const day = (staffId: string, shift: Shift, rest: Partial<Assignment> = {}): Assignment => ({
  staffId,
  date: WED,
  shift,
  ...rest,
})
const oneDay = (assignments: Assignment[]): Roster => ({
  period: { start: WED, days: [WED] },
  groupsPerDay: { [WED]: 1 },
  assignments,
  holes: [],
  warnings: [],
  ...TEST_META,
})
const wall = oneDay([
  day('t1', 'morning', { seat: { kind: 'teacher', group: 1, shift: 'morning' } }),
  day('t2', 'afternoon', { seat: { kind: 'teacher', group: 1, shift: 'afternoon' } }),
  day('t3', 'afternoon'),
  day('n1', 'morning', { seat: { kind: 'nanny', group: 1 }, opener: true }),
  day('n2', 'afternoon', { closer: true }),
  day('n3', 'morning'),
])
const of = (r: Roster, id: string) => r.assignments.find((a) => a.staffId === id)
const on = (r: Roster, date: string) =>
  r.assignments.filter((a) => a.date === date).sort((a, b) => a.staffId.localeCompare(b.staffId))

/** Solves the one-day week again with `sick` away, keeping `roster`. */
function recalcWed(roster: Roster, sick: string[]) {
  const input = makeInput({
    teachers: 3,
    nannies: 3,
    groups: 1,
    days: [WED],
    absent: Object.fromEntries(sick.map((id) => [id, [WED]])),
  })
  const anchor: Anchor = { roster, from: WED, mode: 'minimal' }
  const derived = recalcInput(input, anchor)!
  const result = solve(derived, highs, TEST_META, anchor)
  expect(validateRoster(derived, result)).toEqual([])
  return result
}

describe('anchored solve', () => {
  it('lets a reserve on the same shift take the seat, and moves nobody else', () => {
    const r = recalcWed(wall, ['t2'])
    expect(of(r, 't3')).toEqual(
      day('t3', 'afternoon', { seat: { kind: 'teacher', group: 1, shift: 'afternoon' } }),
    )
    for (const id of ['t1', 'n1', 'n2', 'n3']) expect(of(r, id)).toEqual(of(wall, id))
  })

  it('gives the seat and the key to the nanny already on that shift', () => {
    const r = recalcWed(wall, ['n1'])
    expect(of(r, 'n3')).toEqual(
      day('n3', 'morning', { seat: { kind: 'nanny', group: 1 }, opener: true }),
    )
    for (const id of ['t1', 't2', 't3', 'n2']) expect(of(r, id)).toEqual(of(wall, id))
  })

  it("changes one person's hours when it must, and keeps the closer", () => {
    const late = oneDay(
      wall.assignments.map((a) => (a.staffId === 'n3' ? day('n3', 'afternoon') : a)),
    )
    const r = recalcWed(late, ['n1'])
    expect(of(r, 'n3')).toEqual(
      day('n3', 'morning', { seat: { kind: 'nanny', group: 1 }, opener: true }),
    )
    expect(of(r, 'n2')).toEqual(of(late, 'n2'))
  })

  it('keeps every day before `from` exactly as planned, in both modes', () => {
    // N1 falls ill from Tuesday; her Monday absence is typed in too, after the fact.
    const sick = {
      ...week,
      absences: [
        ...week.absences,
        ...[MON, TUE, WED].map((date) => ({ staffId: 'n1', date, kind: 'sick' as const })),
      ],
    }
    for (const mode of ['minimal', 'full'] as const) {
      const anchor: Anchor = { roster: planned, from: TUE, mode }
      const derived = recalcInput(sick, anchor)!
      const r = solve(derived, highs, TEST_META, anchor)
      expect(validateRoster(derived, r)).toEqual([])
      expect(on(r, MON)).toEqual(on(planned, MON))
      expect(r.assignments.some((a) => a.staffId === 'n1' && a.date >= TUE)).toBe(false)
    }
  })

  it("weighs an earlier day's change of hours above a later one's", () => {
    const anchor: Anchor = { roster: planned, from: MON, mode: 'minimal' }
    const model = buildModel(recalcInput(week, anchor)!)
    anchorModel(model, anchor)
    const terms = model.objectives.keepHours.terms
    expect(terms.get(v.keptHours(0, 0))).toBe(3) // t1 on Monday
    expect(terms.get(v.keptHours(0, 2))).toBe(1) // t1 on Wednesday
  })

  it('adds no stability stage in full mode', () => {
    const anchor: Anchor = { roster: planned, from: TUE, mode: 'full' }
    const model = buildModel(recalcInput(week, anchor)!)
    anchorModel(model, anchor)
    expect(model.objectives.keepPeople.isEmpty()).toBe(true)
    expect(model.objectives.keepDuties.isEmpty()).toBe(true)
  })

  it.each([1, 2, 3, 4, 5, 6, 7, 8])(
    'seed %i: a random sick call keeps the past and every strict rule',
    (seed) => {
      const input = randomInput(seed)
      const days = input.period.days
      if (days.length < 2) return
      const before = solve(input, highs, TEST_META)
      const from = days[1]
      const victim = before.assignments.find((a) => a.date === from)
      if (!victim) return
      const sick = {
        ...input,
        absences: [
          ...input.absences.filter((a) => a.staffId !== victim.staffId || a.date < from),
          ...days
            .filter((date) => date >= from)
            .map((date) => ({ staffId: victim.staffId, date, kind: 'sick' as const })),
        ],
      }
      for (const mode of ['minimal', 'full'] as const) {
        const anchor: Anchor = { roster: before, from, mode }
        const derived = recalcInput(sick, anchor)!
        const r = solve(derived, highs, TEST_META, anchor)
        expect(validateRoster(derived, r)).toEqual([])
        expect(on(r, days[0])).toEqual(on(before, days[0]))
      }
    },
    120_000,
  )
})

describe('makeRoster with an anchor', () => {
  it('solves from the anchor, and a hand-edited anchor keeps its mark', () => {
    const input = makeInput({
      teachers: 3,
      nannies: 3,
      groups: 1,
      days: [WED],
      absent: { t2: [WED] },
    })
    const anchor: Anchor = { roster: { ...wall, edited: true }, from: WED, mode: 'minimal' }
    const result = makeRoster(input, highs, TEST_META, anchor)
    if (!result.ok) throw new Error('expected a roster')
    expect(result.roster.edited).toBe(true)
    expect(of(result.roster, 't3')?.seat).toEqual({
      kind: 'teacher',
      group: 1,
      shift: 'afternoon',
    })
  })

  it('refuses an anchor from another period', () => {
    const input = makeInput({ teachers: 3, nannies: 3, groups: 1, days: [TUE] })
    expect(() => makeRoster(input, highs, TEST_META, keeping(TUE, wall))).toThrow()
  })
})

describe('scheduleChanges', () => {
  it('lists the days from `from` on that someone still works, but differently', () => {
    const after = oneDay(
      wall.assignments
        .filter((a) => a.staffId !== 't2')
        .map((a) =>
          a.staffId === 't3'
            ? day('t3', 'afternoon', { seat: { kind: 'teacher', group: 1, shift: 'afternoon' } })
            : a.staffId === 'n3'
              ? day('n3', 'afternoon')
              : a,
        ),
    )
    expect(scheduleChanges(wall, after, WED)).toEqual([
      { staffId: 't3', date: WED, before: of(wall, 't3'), after: of(after, 't3'), hours: false },
      { staffId: 'n3', date: WED, before: of(wall, 'n3'), after: of(after, 'n3'), hours: true },
    ])
    expect(scheduleChanges(wall, after, '2026-10-29')).toEqual([])
  })
})

describe('a realistic week', () => {
  it('changes one or two people for a sick nanny — far fewer than a full re-plan', () => {
    const state = demoState('2026-09-18')
    const input = solveInputFor(state, '2026-10-26')
    const before = solve(input, highs, TEST_META)
    const sick = {
      ...input,
      absences: [
        ...input.absences,
        ...[WED, '2026-10-29'].map((date) => ({
          staffId: 'demo-nanny-1',
          date,
          kind: 'sick' as const,
        })),
      ],
    }
    const changedPeople = (mode: Anchor['mode']) => {
      const anchor: Anchor = { roster: before, from: WED, mode }
      const after = solve(recalcInput(sick, anchor)!, highs, TEST_META, anchor)
      return new Set(scheduleChanges(before, after, WED).map((c) => c.staffId)).size
    }
    expect(changedPeople('minimal')).toBeLessThanOrEqual(2)
    expect(changedPeople('minimal')).toBeLessThan(changedPeople('full'))
  }, 120_000)
})
