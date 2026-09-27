import { describe, expect, it } from 'vitest'
import { TEST_META, makeStaff } from '../core/fixtures'
import type { Roster } from '../core/types'
import { groupView, personView } from './views'

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
      { text: 'DE: T1' },
      { text: 'DU: T2' },
      { text: 'Dajka: N1 (DE, nyit)', bold: true },
    ])
    expect(view.rows[1].cells[1]).toEqual([
      { text: 'DE: T3' },
      { text: 'DU: BETÖLTETLEN', tone: 'hole' },
      { text: 'Dajka: N2 (DU, zár)', bold: true },
    ])
  })

  it('marks merged groups, closed days and the reserve', () => {
    expect(view.rows[1].cells[0]).toEqual([{ text: 'összevonva', tone: 'muted' }])
    expect(view.rows[0].cells[2]).toEqual([{ text: 'zárva', tone: 'muted' }])
    expect(view.rows[2].cells[0]).toEqual([{ text: 'T3 (DE)' }])
  })
})

describe('personView', () => {
  const view = personView(roster, staff, [{ staffId: 'n2', date: MON }])

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
})
