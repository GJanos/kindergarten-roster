import loadHighs from 'highs'
import { describe, expect, it } from 'vitest'
import { TEST_META, makeInput } from './fixtures'
import { recalcInput } from '../../src/core/recalc'
import { solve } from '../../src/core/solve'
import type { Anchor, Roster } from '../../src/core/types'

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
