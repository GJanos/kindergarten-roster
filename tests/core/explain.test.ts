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
      'T1 keddtől a 2. csoportban.',
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
