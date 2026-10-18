import loadHighs from 'highs'
import { describe, expect, it } from 'vitest'
import { explain as explainRaw } from '../../src/core/explain'
import { nameRef, resolveNames } from '../../src/core/names'
import { TEST_META, consecutiveDays, makeInput } from './fixtures'
import { solve } from '../../src/core/solve'
import type { Assignment, Roster, SolveInput } from '../../src/core/types'

/** What she sees: the warnings with every name reference resolved. */
function explain(input: SolveInput, roster: Roster) {
  return explainRaw(input, roster).map((w) => ({
    ...w,
    text: resolveNames(w.text, input.staff),
    ...(w.action ? { action: resolveNames(w.action, input.staff) } : {}),
  }))
}

const highs = await loadHighs()
const [MON, TUE, WED] = consecutiveDays('2026-10-26', 3)

function warningsFor(input: SolveInput) {
  return explain(input, solve(input, highs, TEST_META))
}

describe('explain — day level', () => {
  it('says nothing about a comfortable week', () => {
    expect(warningsFor(makeInput({ teachers: 4, nannies: 3, groups: 2, days: [MON] }))).toEqual([])
  })

  it('asks to call someone in when no teacher is there', () => {
    const input = makeInput({
      teachers: 2,
      nannies: 2,
      groups: 1,
      days: [WED],
      absent: { t1: [WED], t2: [WED] },
    })
    const [warning] = warningsFor(input)
    expect(warning).toMatchObject({
      code: 'NO_TEACHER',
      severity: 'red',
      text: 'Szerdán nincs óvónő — egy csoport sem indítható.',
      action: 'Hívj be valakit: T1, T2 (távol).',
    })
  })

  it('lists people on leave before the sick when asking to call someone in', () => {
    const input = makeInput({
      teachers: 2,
      nannies: 2,
      groups: 1,
      days: [WED],
      absent: { t1: [WED], t2: [WED] },
    })
    input.absences = input.absences.map((a) => (a.staffId === 't1' ? { ...a, kind: 'sick' } : a))
    const [warning] = warningsFor(input)
    expect(warning.action).toBe('Hívj be valakit: T2, T1 (távol).')
  })

  it('stores names as references, so a later rename reaches the text', () => {
    const input = makeInput({
      teachers: 2,
      nannies: 2,
      groups: 1,
      days: [WED],
      absent: { t1: [WED], t2: [WED] },
    })
    const [warning] = explainRaw(input, solve(input, highs, TEST_META))
    expect(warning.action).toBe(`Hívj be valakit: ${nameRef('t1')}, ${nameRef('t2')} (távol).`)
  })

  it('explains a reduced day', () => {
    const input = makeInput({ teachers: 3, nannies: 1, groups: 3, days: [WED] })
    expect(warningsFor(input).find((w) => w.code === 'GROUPS_REDUCED')?.text).toBe(
      'Szerdán 2 csoport indul 3 helyett (3 óvónő, 1 dajka). A 3. cs. összevonva a többivel.',
    )
  })

  it('notes a hand-set group count and a closed day', () => {
    const input = makeInput({
      teachers: 4,
      nannies: 2,
      groups: 2,
      days: [MON, WED],
      overrides: { [MON]: 1, [WED]: 0 },
    })
    const warnings = warningsFor(input)
    expect(warnings.find((w) => w.code === 'GROUPS_OVERRIDDEN')?.text).toBe(
      'Hétfő: 1 csoport (kézi beállítás).',
    )
    expect(warnings.find((w) => w.code === 'CLOSED_DAY')).toMatchObject({
      severity: 'orange',
      text: 'Szerdán zárva.',
    })
  })
})

describe('explain — holes and substitutions', () => {
  it('names an empty teacher seat and offers fewer groups', () => {
    const input = makeInput({ teachers: 3, nannies: 2, groups: 2, days: [WED] })
    const warning = warningsFor(input).find((w) => w.code === 'TEACHER_SEAT_EMPTY')!
    expect(warning.text).toMatch(
      /^Szerda, [12]\. cs\.: nincs (délelőttös|délutános) óvónő \((7:00–13:30|10:30–17:00)\)\.$/,
    )
    expect(warning.action).toBe('Hívj be valakit, vagy vond össze a csoportot.')
    expect(warning.fix).toEqual({ kind: 'setGroups', date: WED, groups: 1 })
  })

  it('names a missing opener or closer', () => {
    const input = makeInput({ teachers: 2, nannies: 1, groups: 1, days: [WED] })
    const warning = warningsFor(input).find(
      (w) => w.code === 'OPENER_MISSING' || w.code === 'CLOSER_MISSING',
    )!
    expect(warning.text).toMatch(/^Szerdán nincs (nyitó|záró) — csak 1 dajka dolgozik\.$/)
  })

  it('names a teacher in a nanny seat', () => {
    const input = makeInput({ teachers: 5, nannies: 1, groups: 2, days: [WED] })
    const warning = warningsFor(input).find((w) => w.code === 'SUBSTITUTION')!
    expect(warning.text).toMatch(/^Szerda, [12]\. cs\.: dajka helyett óvónő — T\d\.$/)
  })

  it('orders warnings by day, then severity', () => {
    const warnings = warningsFor(
      makeInput({ teachers: 3, nannies: 1, groups: 2, days: [MON, TUE] }),
    )
    const keys = warnings.map((w) => `${w.date}:${{ red: 0, orange: 1, grey: 2 }[w.severity]}`)
    expect(keys).toEqual([...keys].sort())
    expect(warnings.map((w) => w.code)).toContain('TEACHER_SEAT_EMPTY')
  })
})

describe('explain — comfort and fairness', () => {
  const input = makeInput({ teachers: 2, nannies: 2, groups: 2, days: [MON, TUE] })
  const seat = (group: number) => ({ kind: 'teacher' as const, group, shift: 'morning' as const })
  const roster = (assignments: Assignment[]): Roster => ({
    period: input.period,
    groupsPerDay: { [MON]: 2, [TUE]: 2 },
    assignments,
    holes: [],
    warnings: [],
    ...TEST_META,
  })

  it('reports a group switch from the day it happens', () => {
    const warnings = explain(
      input,
      roster([
        { staffId: 't1', date: MON, shift: 'morning', seat: seat(1) },
        { staffId: 't1', date: TUE, shift: 'morning', seat: seat(2) },
      ]),
    )
    expect(warnings.find((w) => w.code === 'GROUP_SWITCH')?.text).toBe(
      'T1 kedden az 1. csoportból a 2. csoportba kerül.',
    )
  })

  it('reports a turnaround', () => {
    const warnings = explain(
      input,
      roster([
        { staffId: 'n1', date: MON, shift: 'afternoon' },
        { staffId: 'n1', date: TUE, shift: 'morning' },
      ]),
    )
    expect(warnings.find((w) => w.code === 'TURNAROUND')?.text).toBe(
      'N1 hétfőn 18:00-ig, kedden 6:00-tól.',
    )
  })

  it('adds how the year stands to an uneven share', () => {
    // Two afternoons of two; t1 has had 2 mornings fewer this year, i.e. 2 afternoons more.
    const warnings = explain(
      { ...input, history: { t1: { morning: -2 } } },
      roster([
        { staffId: 't1', date: MON, shift: 'afternoon' },
        { staffId: 't1', date: TUE, shift: 'afternoon' },
      ]),
    )
    expect(warnings.find((w) => w.code === 'UNEVEN' && w.cells[0].staffId === 't1')?.text).toBe(
      'Egyenlő elosztás nem volt lehetséges: T1 2 délutános műszak a 2-ből. Idén eddig 2 délutánnal több jutott neki.',
    )
  })

  it('reports a share missed by a whole day', () => {
    const warnings = explain(
      input,
      roster([
        { staffId: 't1', date: MON, shift: 'afternoon' },
        { staffId: 't1', date: TUE, shift: 'afternoon' },
      ]),
    )
    expect(warnings.find((w) => w.code === 'UNEVEN' && w.cells[0].staffId === 't1')?.text).toBe(
      'Egyenlő elosztás nem volt lehetséges: T1 2 délutános műszak a 2-ből.',
    )
  })
})

describe('v3-b warnings', () => {
  const input = makeInput({ teachers: 4, nannies: 4, groups: 2, days: [MON] })
  const at = (
    staffId: string,
    shift: 'morning' | 'afternoon',
    rest: Partial<Assignment> = {},
  ): Assignment => ({ staffId, date: MON, shift, ...rest })
  const roster = (assignments: Assignment[], holes: Roster['holes'] = []): Roster => ({
    period: input.period,
    groupsPerDay: { [MON]: 2 },
    assignments,
    holes,
    warnings: [],
    ...TEST_META,
  })
  const teachers = [
    at('t1', 'morning', { seat: { kind: 'teacher', group: 1, shift: 'morning' }, duty: true }),
    at('t2', 'afternoon', { seat: { kind: 'teacher', group: 1, shift: 'afternoon' }, duty: true }),
    at('t3', 'morning', { seat: { kind: 'teacher', group: 2, shift: 'morning' } }),
    at('t4', 'afternoon', { seat: { kind: 'teacher', group: 2, shift: 'afternoon' } }),
  ]
  const codes = (r: Roster) => explain(input, r).map((w) => w.code)

  it('flags a pair whose nannies share a shift, and a lopsided day', () => {
    const r = roster([
      ...teachers,
      at('n1', 'morning', { seat: { kind: 'nanny', group: 1 }, opener: true }),
      at('n2', 'morning', { seat: { kind: 'nanny', group: 2 } }),
      at('n3', 'morning'),
      at('n4', 'afternoon', { closer: true }),
    ])
    const warnings = explain(input, r)
    expect(warnings.find((w) => w.code === 'PAIR_SAME')?.text).toBe(
      'Hétfő, 1–2. cs.: mindkét dajka DE.',
    )
    const lopsided = warnings.find((w) => w.code === 'SHIFT_IMBALANCE')
    expect(lopsided?.text).toBe('Hétfő: dajkák 3 DE / 1 DU.')
    expect(lopsided?.severity).toBe('grey')
  })

  it('turns orange at a gap of 3', () => {
    const r = roster([
      ...teachers,
      at('n1', 'morning', { seat: { kind: 'nanny', group: 1 }, opener: true }),
      at('n2', 'morning', { seat: { kind: 'nanny', group: 2 } }),
      at('n3', 'morning'),
      at('n4', 'morning'),
    ])
    expect(explain(input, r).find((w) => w.code === 'SHIFT_IMBALANCE')?.severity).toBe('orange')
  })

  it('stays quiet on a split pair and an even day', () => {
    const r = roster([
      ...teachers,
      at('n1', 'morning', { seat: { kind: 'nanny', group: 1 }, opener: true }),
      at('n2', 'afternoon', { seat: { kind: 'nanny', group: 2 }, closer: true }),
      at('n3', 'morning'),
      at('n4', 'afternoon'),
    ])
    expect(codes(r)).not.toContain('PAIR_SAME')
    expect(codes(r)).not.toContain('SHIFT_IMBALANCE')
  })

  it('reports a missing ügyelet in red', () => {
    const r = roster(
      teachers.map((a) => ({ ...a, duty: undefined })),
      [{ kind: 'duty', date: MON }],
    )
    const missing = explain(input, r).find((w) => w.code === 'DUTY_MISSING')
    expect(missing?.severity).toBe('red')
    expect(missing?.text).toBe(
      'Hétfőn nincs ügyeletes csoport: egy csoportban sincs meg mindkét óvónő.',
    )
  })
})

describe('explain — helpers (v3-c)', () => {
  const D = '2026-10-26'
  it('gives a helper stand-in the hours and the reason, and the asszisztens beside a group nothing', () => {
    const input = makeInput({ teachers: 3, nannies: 2, assistants: 2, groups: 2, days: [D] })
    const roster = solve(input, highs, TEST_META)
    const subs = explain(input, roster).filter((w) => w.code === 'SUBSTITUTION')
    expect(subs).toHaveLength(1)
    expect(resolveNames(subs[0].text, input.staff)).toMatch(/^Hétfő: A\d 10–18, mert /)
  })
})
