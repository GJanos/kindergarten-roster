import { describe, expect, it } from 'vitest'
import { TEST_META, makeInput } from './fixtures'
import type { Assignment, Roster, SolveInput } from './types'
import { validateRoster } from './validate'

const D = '2026-10-26'
const E = '2026-10-27'

// One group: t1 morning, t2 afternoon, n1 in the group and opening, n2 in reserve closing.
function dayOf(date: string): Assignment[] {
  return [
    {
      staffId: 't1',
      date,
      shift: 'morning',
      seat: { kind: 'teacher', group: 1, shift: 'morning' },
    },
    {
      staffId: 't2',
      date,
      shift: 'afternoon',
      seat: { kind: 'teacher', group: 1, shift: 'afternoon' },
    },
    { staffId: 'n1', date, shift: 'morning', seat: { kind: 'nanny', group: 1 }, opener: true },
    { staffId: 'n2', date, shift: 'afternoon', closer: true },
  ]
}

function setup(days = [D]): { input: SolveInput; roster: Roster } {
  const input = makeInput({ teachers: 2, nannies: 2, groups: 1, days })
  const roster: Roster = {
    period: input.period,
    groupsPerDay: Object.fromEntries(days.map((d) => [d, 1])),
    assignments: days.flatMap(dayOf),
    holes: [],
    warnings: [],
    ...TEST_META,
  }
  return { input, roster }
}

const rules = (input: SolveInput, roster: Roster) =>
  validateRoster(input, roster).map((v) => v.rule)

function edit(roster: Roster, staffId: string, change: Partial<Assignment>): Roster {
  return {
    ...roster,
    assignments: roster.assignments.map((a) =>
      a.staffId === staffId && a.date === D ? { ...a, ...change } : a,
    ),
  }
}

describe('validateRoster', () => {
  it('accepts a valid roster', () => {
    const { input, roster } = setup()
    expect(validateRoster(input, roster)).toEqual([])
  })

  it('needs exactly one shift for everyone present', () => {
    const { input, roster } = setup()
    const missing = { ...roster, assignments: roster.assignments.filter((a) => a.staffId !== 't2') }
    expect(rules(input, missing)).toContain('presentNeedsExactlyOneShift')
    expect(rules(input, missing)).toContain('teacherSeatNotFilledOnce')
  })

  it('keeps the absent at home', () => {
    const { input, roster } = setup()
    input.absences = [{ staffId: 'n2', date: D }]
    expect(rules(input, roster)).toContain('absentButWorking')
  })

  it('keeps inactive staff out', () => {
    const { input, roster } = setup()
    input.staff[3].active = false // n2
    expect(rules(input, roster)).toContain('unknownOrInactiveStaff')
  })

  it('seats teachers on their own shift only', () => {
    const { input, roster } = setup()
    expect(rules(input, edit(roster, 't2', { shift: 'morning' }))).toContain('teacherSeatOffShift')
  })

  it('never seats a nanny in a teacher seat', () => {
    const { input, roster } = setup()
    const bad = edit(roster, 'n1', { seat: { kind: 'teacher', group: 1, shift: 'morning' } })
    expect(rules(input, bad)).toContain('nannyInTeacherSeat')
  })

  it('flags every teacher in a nanny seat as a substitution', () => {
    const { input, roster } = setup()
    const swapped = edit(edit(roster, 't1', { seat: { kind: 'nanny', group: 1 } }), 'n1', {
      seat: undefined,
    })
    expect(rules(input, swapped)).toContain('substitutionFlag')
  })

  it('opens on a morning shift and closes on an afternoon one', () => {
    const { input, roster } = setup()
    expect(rules(input, edit(roster, 'n1', { shift: 'afternoon' }))).toContain('openerNotMorning')
  })

  it('has exactly one opener, or a hole', () => {
    const { input, roster } = setup()
    expect(rules(input, edit(roster, 'n2', { opener: true }))).toContain('openerNotExactlyOne')
  })

  it('never lists a hole for a filled seat', () => {
    const { input, roster } = setup()
    const extra: Roster = {
      ...roster,
      holes: [{ kind: 'teacherSeat', date: D, group: 1, shift: 'morning' }],
    }
    expect(rules(input, extra)).toContain('teacherSeatNotFilledOnce')
  })

  it('leaves no group without a teacher', () => {
    const { input, roster } = setup()
    const empty: Roster = {
      ...roster,
      assignments: roster.assignments.map((a) =>
        a.staffId.startsWith('t') ? { ...a, seat: undefined } : a,
      ),
      holes: [
        { kind: 'teacherSeat', date: D, group: 1, shift: 'morning' },
        { kind: 'teacherSeat', date: D, group: 1, shift: 'afternoon' },
      ],
    }
    expect(rules(input, empty)).toContain('groupWithoutTeacher')
  })

  it('matches the effective group count', () => {
    const { input, roster } = setup()
    expect(rules(input, { ...roster, groupsPerDay: { [D]: 2 } })).toContain('groupCount')
  })

  it('never lets anyone open on every day', () => {
    const { input, roster } = setup([D, E])
    expect(rules(input, roster)).toEqual(
      expect.arrayContaining(['openerEveryDay', 'closerEveryDay']),
    )
  })

  it('keeps a closed day empty', () => {
    const { input, roster } = setup()
    input.dayPlans = [{ date: D, requestedGroups: 1, override: 0 }]
    expect(rules(input, { ...roster, groupsPerDay: { [D]: 0 } })).toContain('closedDayNotEmpty')
  })
})
