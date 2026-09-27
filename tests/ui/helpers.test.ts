import { describe, expect, it } from 'vitest'
import { TEST_META, makeStaff } from '../core/fixtures'
import type { Roster, Warning } from '../../src/core/types'
import { monthLabel, sinceText, weekdayInitial } from '../../src/i18n/hu'
import { daysBetween, monthDays, shiftMonth, today } from '../../src/ui/dates'
import { highlightedCells } from '../../src/ui/highlight'

describe('dates', () => {
  it('knows today, day gaps and months', () => {
    expect(today(new Date(2026, 9, 5, 23, 30))).toBe('2026-10-05')
    expect(daysBetween('2026-10-01', '2026-10-08')).toBe(7)
    expect(monthDays('2026-02')).toHaveLength(28)
    expect(monthDays('2026-10').at(-1)).toBe('2026-10-31')
    expect(shiftMonth('2026-12', 1)).toBe('2027-01')
    expect(shiftMonth('2026-01', -1)).toBe('2025-12')
  })
})

describe('screen texts', () => {
  it('labels months, weekdays and the age of the last backup', () => {
    expect(monthLabel('2026-10')).toBe('2026. október')
    expect(weekdayInitial('2026-10-28')).toBe('Sze')
    expect(sinceText(0)).toBe('ma')
    expect(sinceText(1)).toBe('tegnap')
    expect(sinceText(3)).toBe('3 napja')
  })
})

describe('highlightedCells', () => {
  const MON = '2026-10-26'
  const roster: Roster = {
    period: { start: MON, days: [MON] },
    groupsPerDay: { [MON]: 2 },
    assignments: [
      {
        staffId: 't1',
        date: MON,
        shift: 'morning',
        seat: { kind: 'teacher', group: 2, shift: 'morning' },
      },
      { staffId: 'n1', date: MON, shift: 'morning', opener: true },
    ],
    holes: [],
    warnings: [],
    ...TEST_META,
  }
  const staff = makeStaff(1, 1)
  const warning = (cells: Warning['cells']): Warning => ({
    code: 'UNEVEN',
    severity: 'grey',
    date: MON,
    text: '',
    cells,
  })

  it('points at a group, a person or a whole day', () => {
    expect([...highlightedCells(roster, staff, warning([{ date: MON, group: 1 }]))]).toEqual([
      `0|${MON}`,
    ])
    expect([...highlightedCells(roster, staff, warning([{ staffId: 't1', date: MON }]))]).toEqual([
      `1|${MON}`,
    ])
    expect([...highlightedCells(roster, staff, warning([{ staffId: 'n1', date: MON }]))]).toEqual([
      `3|${MON}`,
    ])
    expect(highlightedCells(roster, staff, warning([{ date: MON }])).size).toBe(4)
    expect(highlightedCells(roster, staff, undefined).size).toBe(0)
  })
})
