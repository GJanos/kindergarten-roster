import { describe, expect, it } from 'vitest'
import { TEST_META, makeStaff } from '../core/fixtures'
import type { Roster } from '../../src/core/types'
import { groupView, isDutyCell, personView } from '../../src/export/views'

const [MON, TUE, WED] = ['2026-10-26', '2026-10-27', '2026-10-28']
const staff = makeStaff(3, 2)

// Monday: 1 group with t3 as substitute; Tuesday: 2 groups, one teacher seat empty; Wednesday closed.
const roster: Roster = {
  period: { start: MON, days: [MON, TUE, WED] },
  groupsPerDay: { [MON]: 1, [TUE]: 2, [WED]: 0 },
  assignments: [
    {
      staffId: 't1',
      date: MON,
      shift: 'morning',
      seat: { kind: 'teacher', group: 1, shift: 'morning' },
    },
    {
      staffId: 't2',
      date: MON,
      shift: 'afternoon',
      seat: { kind: 'teacher', group: 1, shift: 'afternoon' },
    },
    { staffId: 't3', date: MON, shift: 'morning' },
    { staffId: 'n1', date: MON, shift: 'morning', seat: { kind: 'nanny', group: 1 }, opener: true },
    {
      staffId: 't1',
      date: TUE,
      shift: 'morning',
      seat: { kind: 'teacher', group: 1, shift: 'morning' },
    },
    {
      staffId: 't2',
      date: TUE,
      shift: 'afternoon',
      seat: { kind: 'teacher', group: 1, shift: 'afternoon' },
    },
    {
      staffId: 't3',
      date: TUE,
      shift: 'morning',
      seat: { kind: 'teacher', group: 2, shift: 'morning' },
    },
    { staffId: 'n1', date: TUE, shift: 'morning', seat: { kind: 'nanny', group: 1 }, opener: true },
    {
      staffId: 'n2',
      date: TUE,
      shift: 'afternoon',
      seat: { kind: 'nanny', group: 2 },
      closer: true,
    },
  ],
  holes: [
    { kind: 'closer', date: MON },
    { kind: 'teacherSeat', date: TUE, group: 2, shift: 'afternoon' },
  ],
  warnings: [],
  ...TEST_META,
}

describe('groupView', () => {
  const view = groupView(roster, staff, ['Pillangó, Süni'])

  it('has a row per group, then the reserve rows', () => {
    expect(view.rows.map((r) => r.label)).toEqual([
      '1. csoport – Pillangó, Süni',
      '2. csoport',
      'Csoporton kívül – óvónő',
      'Csoporton kívül – dajka',
    ])
  })

  it('lists the seats, bolds the keys and marks holes', () => {
    expect(view.rows[0].cells[0]).toEqual([
      { text: 'DE: T1', staffId: 't1' },
      { text: 'DU: T2', staffId: 't2' },
      { text: 'Dajka: N1 (DE, nyit)', bold: true, staffId: 'n1' },
    ])
    expect(view.rows[1].cells[1]).toEqual([
      { text: 'DE: T3', staffId: 't3' },
      { text: 'DU: BETÖLTETLEN', tone: 'hole' },
      { text: 'Dajka: N2 (DU, zár)', bold: true, staffId: 'n2' },
    ])
  })

  it('marks merged groups, closed days and the reserve', () => {
    expect(view.rows[1].cells[0]).toEqual([{ text: 'összevonva', tone: 'muted' }])
    expect(view.rows[0].cells[2]).toEqual([{ text: 'zárva', tone: 'muted' }])
    expect(view.rows[2].cells[0]).toEqual([{ text: 'T3 (DE)', staffId: 't3' }])
  })
})

describe('personView', () => {
  const view = personView(roster, staff, [{ staffId: 'n2', date: MON, kind: 'other' }])

  it('lists teachers, then nannies', () => {
    expect(view.rows.map((r) => r.name)).toEqual(['T1', 'T2', 'T3', 'N1', 'N2'])
  })

  it('describes each day', () => {
    expect(view.rows[2].cells[0]).toEqual({ text: 'DE · tartalék', fill: 'morning' })
    expect(view.rows[3].cells[0]).toEqual({
      text: 'DE · 1. cs. · nyit',
      fill: 'morning',
      bold: true,
    })
    expect(view.rows[4].cells[0]).toEqual({ text: 'távol', fill: 'absent' })
    expect(view.rows[4].cells[2]).toEqual({ text: 'zárva', fill: 'closed' })
  })

  it('says szabadság or beteg for those kinds', () => {
    // n2 is off on Monday in the fixture roster (and works on Tuesday).
    const on = (kind: 'leave' | 'sick') =>
      personView(roster, staff, [{ staffId: 'n2', date: MON, kind }]).rows[4].cells[0]
    expect(on('leave')).toEqual({ text: 'szabadság', fill: 'absent' })
    expect(on('sick')).toEqual({ text: 'beteg', fill: 'absent' })
  })
})

describe('ügyelet (v3-b)', () => {
  const dutyDay: Roster = {
    period: { start: MON, days: [MON] },
    groupsPerDay: { [MON]: 1 },
    assignments: [
      {
        staffId: 't1',
        date: MON,
        shift: 'morning',
        seat: { kind: 'teacher', group: 1, shift: 'morning' },
        duty: true,
      },
      {
        staffId: 't2',
        date: MON,
        shift: 'afternoon',
        seat: { kind: 'teacher', group: 1, shift: 'afternoon' },
        duty: true,
      },
      {
        staffId: 'n1',
        date: MON,
        shift: 'morning',
        seat: { kind: 'nanny', group: 1 },
        opener: true,
      },
      { staffId: 'n2', date: MON, shift: 'afternoon', closer: true },
    ],
    holes: [],
    warnings: [],
    ...TEST_META,
  }

  it('heads the duty group with Ügyelet and shows the shifted start and end', () => {
    const cell = groupView(dutyDay, staff).rows[0].cells[0]
    expect(cell[0]).toEqual({ text: 'Ügyelet', bold: true, tone: 'duty' })
    expect(isDutyCell(cell)).toBe(true)
    expect(isDutyCell([{ text: 'DE: T1' }])).toBe(false)
    expect(cell[1].text).toBe('DE: T1 6:30-tól')
    expect(cell[2].text).toBe('DU: T2 17:30-ig')
  })

  it('marks the day in the person view', () => {
    const t1 = personView(dutyDay, staff, []).rows.find((r) => r.staffId === 't1')!
    expect(t1.cells[0].text).toBe('DE · 1. cs. · ügyelet')
  })
})

describe('helpers (v3-c)', () => {
  const helperStaff = makeStaff(3, 2, 2, 1)
  const helped: Roster = {
    ...roster,
    assignments: [
      ...roster.assignments,
      { staffId: 'a1', date: TUE, shift: 'day', seat: { kind: 'helper', group: 1 } },
      { staffId: 'a2', date: TUE, shift: 'day' },
      { staffId: 'c1', date: TUE, shift: 'day' },
    ],
  }

  it('shows the asszisztens beside her group, and the rest on one helper row', () => {
    const view = groupView(helped, helperStaff)
    const tue = view.days.indexOf(TUE)
    expect(view.rows[0].cells[tue].map((l) => l.text)).toContain('Asszisztens: A1 (8–16)')
    const last = view.rows.at(-1)!
    expect(last.label).toBe('Asszisztens, civil')
    expect(last.cells[tue].map((l) => l.text)).toEqual([
      'Asszisztens: A2 (8–16)',
      'Civil: C1 (8–16)',
    ])
  })

  it('shows a stand-in in the substitution tone, with hours', () => {
    const standIn: Roster = {
      ...roster,
      assignments: [
        ...roster.assignments,
        {
          staffId: 'a1',
          date: TUE,
          shift: 'afternoon',
          seat: { kind: 'teacher', group: 2, shift: 'afternoon' },
          substitution: true,
        },
      ],
      holes: roster.holes.filter((h) => h.kind !== 'teacherSeat'),
    }
    const view = groupView(standIn, helperStaff)
    expect(view.rows[1].cells[view.days.indexOf(TUE)]).toContainEqual({
      text: 'DU: A1 (asszisztens, 10–18)',
      tone: 'substitution',
      staffId: 'a1',
    })
  })

  it('has no helper row in a week without helpers', () => {
    expect(groupView(roster, staff).rows.map((r) => r.label)).not.toContain('Asszisztens, civil')
  })

  it('lists helpers last in the person view, 8–16 as NAP with its own fill', () => {
    const view = personView(helped, helperStaff, [])
    expect(view.rows.map((r) => r.staffId).slice(-3)).toEqual(['a1', 'a2', 'c1'])
    const tue = view.days.indexOf(TUE)
    expect(view.rows.at(-3)!.cells[tue]).toEqual({ text: 'NAP · 1. cs.', fill: 'day' })
    expect(view.rows.at(-1)!.cells[tue]).toEqual({ text: 'NAP · civil', fill: 'day' })
  })
})
