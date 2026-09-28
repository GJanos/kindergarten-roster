import { describe, expect, it } from 'vitest'
import { TEST_META, makeStaff } from '../core/fixtures'
import type { Assignment, Roster } from '../../src/core/types'
import { changeSummary } from '../../src/ui/changeSummary'

const WED = '2026-10-28'
const THU = '2026-10-29'
const staff = makeStaff(3, 1)
const roster = (assignments: Assignment[]): Roster => ({
  period: { start: WED, days: [WED, THU] },
  groupsPerDay: { [WED]: 1, [THU]: 1 },
  assignments,
  holes: [],
  warnings: [],
  ...TEST_META,
})
const morningSeat = { kind: 'teacher' as const, group: 1, shift: 'morning' as const }
const before = roster([
  { staffId: 't1', date: WED, shift: 'morning', seat: morningSeat },
  { staffId: 't2', date: WED, shift: 'afternoon' },
  { staffId: 't2', date: THU, shift: 'afternoon' },
  { staffId: 't3', date: THU, shift: 'afternoon' },
  { staffId: 'n1', date: WED, shift: 'morning', opener: true },
])
// T1 is off sick. T2 covers her morning today and again on Thursday; T3 moves to a morning on
// Thursday; N1 hands the key to nobody in particular — only the key changed for her.
const after = roster([
  { staffId: 't2', date: WED, shift: 'morning', seat: morningSeat },
  { staffId: 't2', date: THU, shift: 'morning' },
  { staffId: 't3', date: THU, shift: 'morning' },
  { staffId: 'n1', date: WED, shift: 'morning' },
])

describe('changeSummary', () => {
  it('groups by person: hours changes to phone first, today’s first; key or place moves after', () => {
    expect(changeSummary(before, after, WED, staff, WED)).toEqual([
      {
        title: '2 munkatárs ideje változott — őket érdemes felhívni:',
        items: [
          'T2 — ma: DE 7:00–13:30 (eddig DU), 1. cs. · csütörtök: DE 7:00–13:30 (eddig DU), csoporton kívül',
          'T3 — csütörtök: DE 7:00–13:30 (eddig DU), csoporton kívül',
        ],
      },
      {
        title: '1 munkatársnak csak a helye vagy a kulcsa változott:',
        items: ['N1 — ma: nem nyit'],
      },
    ])
  })

  it('says so when nobody else changed', () => {
    expect(changeSummary(before, before, WED, staff, WED)).toEqual([
      { title: 'Senki más beosztása nem változott.', items: [] },
    ])
  })
})
