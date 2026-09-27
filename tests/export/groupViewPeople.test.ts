import { describe, expect, it } from 'vitest'
import { TEST_META, makeStaff } from '../core/fixtures'
import type { Roster } from '../../src/core/types'
import { groupView } from '../../src/export/views'

const WED = '2026-10-28'
const THU = '2026-10-29'
const staff = makeStaff(3, 2)

const roster: Roster = {
  period: { start: WED, days: [WED, THU] },
  groupsPerDay: { [WED]: 1, [THU]: 0 },
  assignments: [
    {
      staffId: 't1',
      date: WED,
      shift: 'morning',
      seat: { kind: 'teacher', group: 1, shift: 'morning' },
    },
    { staffId: 't2', date: WED, shift: 'afternoon' },
    { staffId: 'n1', date: WED, shift: 'morning', seat: { kind: 'nanny', group: 1 }, opener: true },
    { staffId: 'n2', date: WED, shift: 'afternoon', closer: true },
  ],
  holes: [{ kind: 'teacherSeat', date: WED, group: 1, shift: 'afternoon' }],
  warnings: [],
  ...TEST_META,
}

describe('groupView lines', () => {
  it('carry the staff id of the person they show, and nothing else does', () => {
    const view = groupView(roster, staff)
    const wed = view.rows.map((row) => row.cells[0])
    expect(wed[0]).toEqual([
      { text: 'DE: T1', staffId: 't1' },
      { text: 'DU: BETÖLTETLEN', tone: 'hole' },
      { text: 'Dajka: N1 (DE, nyit)', bold: true, staffId: 'n1' },
    ])
    expect(wed[1]).toEqual([{ text: 'T2 (DU)', staffId: 't2' }])
    expect(wed[2]).toEqual([{ text: 'N2 (DU, zár)', bold: true, staffId: 'n2' }])
    expect(view.rows[0].cells[1]).toEqual([{ text: 'zárva', tone: 'muted' }])
  })
})
