import { describe, expect, it } from 'vitest'
import { TEST_META } from '../core/fixtures'
import type { Roster } from '../../src/core/types'
import { footnotes } from '../../src/export/views'

const WED = '2026-10-28'

describe('footnotes', () => {
  it('prints red and orange warnings with their action, but not grey ones', () => {
    const roster: Roster = {
      period: { start: WED, days: [WED] },
      groupsPerDay: { [WED]: 1 },
      assignments: [],
      holes: [],
      warnings: [
        {
          code: 'OPENER_MISSING',
          severity: 'red',
          date: WED,
          text: 'Szerdán nincs nyitó — csak 1 dajka dolgozik.',
          action: 'Valaki jöjjön 6:00-ra, vagy nyisson később az óvoda.',
          cells: [{ date: WED }],
        },
        { code: 'CLOSED_DAY', severity: 'orange', date: WED, text: 'Szerdán zárva.', cells: [] },
        {
          code: 'TURNAROUND',
          severity: 'grey',
          date: WED,
          text: 'Nóra szerdán 6:00-tól.',
          cells: [],
        },
      ],
      ...TEST_META,
    }
    expect(footnotes(roster)).toEqual([
      '* Szerdán nincs nyitó — csak 1 dajka dolgozik. Valaki jöjjön 6:00-ra, vagy nyisson később az óvoda.',
      '* Szerdán zárva.',
    ])
  })
})
