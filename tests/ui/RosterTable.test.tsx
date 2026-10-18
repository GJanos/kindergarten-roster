// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { TEST_META, makeStaff } from '../core/fixtures'
import type { Roster } from '../../src/core/types'
import { RosterTable } from '../../src/ui/RosterTable'

afterEach(cleanup)

const MON = '2026-10-26'
const staff = makeStaff(4, 2)
const roster: Roster = {
  period: { start: MON, days: [MON] },
  groupsPerDay: { [MON]: 2 },
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
    {
      staffId: 't3',
      date: MON,
      shift: 'morning',
      seat: { kind: 'teacher', group: 2, shift: 'morning' },
      duty: true,
    },
    {
      staffId: 't4',
      date: MON,
      shift: 'afternoon',
      seat: { kind: 'teacher', group: 2, shift: 'afternoon' },
      duty: true,
    },
    { staffId: 'n1', date: MON, shift: 'morning', seat: { kind: 'nanny', group: 1 }, opener: true },
    {
      staffId: 'n2',
      date: MON,
      shift: 'afternoon',
      seat: { kind: 'nanny', group: 2 },
      closer: true,
    },
  ],
  holes: [],
  warnings: [],
  ...TEST_META,
}

describe('RosterTable', () => {
  it("marks the day's ügyelet group cell, and only that one", () => {
    render(<RosterTable roster={roster} staff={staff} />)
    const marked = [...document.querySelectorAll('td.duty-cell')]
    expect(marked).toHaveLength(1)
    expect(marked[0].textContent).toContain('DE: T3 6:30-tól')
    expect(marked[0].querySelector('.duty')?.textContent).toBe('Ügyelet')
  })
})
