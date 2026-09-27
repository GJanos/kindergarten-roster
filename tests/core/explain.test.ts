import loadHighs from 'highs'
import { describe, expect, it } from 'vitest'
import { explain } from '../../src/core/explain'
import { TEST_META, consecutiveDays, makeInput } from './fixtures'
import { solve } from '../../src/core/solve'
import type { SolveInput } from '../../src/core/types'

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
