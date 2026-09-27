import { describe, expect, it } from 'vitest'
import { makeInput } from '../core/fixtures'
import type { Warning, WarningCode } from '../../src/core/types'
import { shownWarningCount, warningDays } from '../../src/ui/warningDays'

const MON = '2026-10-26'
const TUE = '2026-10-27'
const WED = '2026-10-28'

const SEVERITY: Record<string, Warning['severity']> = {
  TEACHER_SEAT_EMPTY: 'red',
  OPENER_MISSING: 'red',
  GROUPS_REDUCED: 'orange',
  GROUPS_OVERRIDDEN: 'orange',
  SUBSTITUTION: 'orange',
  CLOSED_DAY: 'orange',
  UNEVEN: 'grey',
}

function warning(code: WarningCode, date: string, text: string, rest: Partial<Warning> = {}) {
  return { code, severity: SEVERITY[code], date, text, cells: [{ date }], ...rest } as Warning
}

const seat = (date: string, text: string, groups?: number) =>
  warning('TEACHER_SEAT_EMPTY', date, text, {
    action: 'Hívj be valakit, vagy vond össze a csoportot.',
    ...(groups ? { fix: { kind: 'setGroups' as const, date, groups } } : {}),
  })

// 4 teachers and 2 nannies for 3 groups: teacher seats run short every day.
const input = makeInput({ teachers: 4, nannies: 2, groups: 3 })

describe('warningDays', () => {
  it('puts each day in one card, red before orange, with the fix and the action once', () => {
    const { days } = warningDays(
      [
        warning('SUBSTITUTION', MON, 'Hétfő, 3. cs.: dajka helyett óvónő — T4.'),
        seat(MON, 'Hétfő, 1. cs.: nincs délutános óvónő (10:30–17:00).', 2),
        seat(MON, 'Hétfő, 2. cs.: nincs délelőttös óvónő (7:00–13:30).', 2),
        seat(TUE, 'Kedd, 1. cs.: nincs délutános óvónő (10:30–17:00).', 2),
      ],
      input,
    )
    expect(days.map((d) => d.date)).toEqual([MON, TUE])
    expect(days[0].items.map((w) => w.code)).toEqual([
      'TEACHER_SEAT_EMPTY',
      'TEACHER_SEAT_EMPTY',
      'SUBSTITUTION',
    ])
    expect(days[0].holes).toBe(2)
    expect(days[0].fixes.filter((f) => f.kind === 'setGroups')).toEqual([
      { kind: 'setGroups', date: MON, groups: 2 },
    ])
    expect(days[0].actions).toEqual(['Hívj be valakit, vagy vond össze a csoportot.'])
  })

  it('drops the day name the card already shows', () => {
    const { days } = warningDays(
      [seat(MON, 'Hétfő, 1. cs.: nincs délutános óvónő (10:30–17:00).')],
      input,
    )
    expect(days[0].texts).toEqual(['1. cs.: nincs délutános óvónő (10:30–17:00).'])
  })

  it('leaves out what the day chips already say', () => {
    const { days } = warningDays(
      [
        warning('CLOSED_DAY', WED, 'Szerdán zárva.'),
        warning('GROUPS_OVERRIDDEN', MON, 'Hétfő: 3 csoport (kézi beállítás).'),
      ],
      input,
    )
    expect(days).toEqual([])
  })

  it('keeps the grey notes apart, for a collapsed list', () => {
    const uneven = warning('UNEVEN', MON, 'Egyenlő elosztás nem volt lehetséges: T1 …')
    const { days, notes } = warningDays([uneven], input)
    expect(days).toEqual([])
    expect(notes).toEqual([uneven])
  })

  it('offers calling in an absent teacher for an empty teacher seat', () => {
    const away = makeInput({ teachers: 5, nannies: 2, groups: 3, absent: { t5: [MON], n1: [MON] } })
    const { days } = warningDays(
      [seat(MON, 'Hétfő, 1. cs.: nincs délutános óvónő (10:30–17:00).')],
      away,
    )
    expect(days[0].fixes).toEqual([{ kind: 'callIn', date: MON, staffId: 't5', name: 'T5' }])
  })

  it('offers calling in an absent nanny when nobody opens', () => {
    const away = makeInput({ teachers: 6, nannies: 2, groups: 3, absent: { t1: [MON], n2: [MON] } })
    const { days } = warningDays(
      [warning('OPENER_MISSING', MON, 'Hétfőn nincs nyitó — csak 1 dajka dolgozik.')],
      away,
    )
    expect(days[0].fixes).toEqual([{ kind: 'callIn', date: MON, staffId: 'n2', name: 'N2' }])
  })

  it('offers people on leave first, then other absences, and the sick last, marked', () => {
    const away = makeInput({
      teachers: 6,
      nannies: 2,
      groups: 3,
      absent: { t4: [MON], t5: [MON], t6: [MON] },
    })
    const kinds = { t4: 'sick', t5: 'other', t6: 'leave' } as const
    away.absences = away.absences.map((a) => ({
      ...a,
      kind: kinds[a.staffId as keyof typeof kinds],
    }))
    const { days } = warningDays(
      [seat(MON, 'Hétfő, 1. cs.: nincs délutános óvónő (10:30–17:00).')],
      away,
    )
    expect(days[0].fixes).toEqual([
      { kind: 'callIn', date: MON, staffId: 't6', name: 'T6' },
      { kind: 'callIn', date: MON, staffId: 't5', name: 'T5' },
      { kind: 'callIn', date: MON, staffId: 't4', name: 'T4', sick: true },
    ])
  })

  it('offers only the role that would bring a merged group back', () => {
    // 2 teachers, 3 nannies present: g_max = min(2, 2) = 2. Another teacher gives
    // min(3, 3) = 3; another nanny still min(2, 3) = 2, so only the teacher is offered.
    const away = makeInput({ teachers: 3, nannies: 4, groups: 3, absent: { t3: [MON], n4: [MON] } })
    const { days } = warningDays(
      [warning('GROUPS_REDUCED', MON, 'Hétfőn 2 csoport indul 3 helyett …')],
      away,
    )
    expect(days[0].fixes).toEqual([{ kind: 'callIn', date: MON, staffId: 't3', name: 'T3' }])
  })
})

describe('shownWarningCount', () => {
  it('counts exactly the lines the day cards show', () => {
    const warnings = [
      seat(MON, 'Hétfő, 1. cs.: nincs délutános óvónő (10:30–17:00).', 2),
      warning('SUBSTITUTION', MON, 'Hétfő, 3. cs.: dajka helyett óvónő — T4.'),
      warning('CLOSED_DAY', WED, 'Szerdán zárva.'),
      warning('GROUPS_OVERRIDDEN', MON, 'Hétfő: 3 csoport (kézi beállítás).'),
      warning('UNEVEN', MON, 'Egyenlő elosztás nem volt lehetséges: T1 …'),
    ]
    const shown = warningDays(warnings, input).days.reduce((sum, d) => sum + d.items.length, 0)
    expect(shownWarningCount(warnings)).toBe(2)
    expect(shownWarningCount(warnings)).toBe(shown)
  })
})
