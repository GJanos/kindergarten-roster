import { describe, expect, it } from 'vitest'
import {
  compactDates,
  dayHeader,
  dayName,
  formatDate,
  formatPeriod,
  fromDay,
  groupName,
  onDay,
  ui,
} from '../../src/i18n/hu'

describe('Hungarian dates', () => {
  it('names days in the forms the warnings need', () => {
    expect(dayName('2026-10-28')).toBe('szerda')
    expect(onDay('2026-10-28')).toBe('szerdán')
    expect(fromDay('2026-10-29')).toBe('csütörtöktől')
    expect(onDay('2026-10-26')).toBe('hétfőn')
    expect(onDay('2026-12-12')).toBe('szombaton')
  })

  it('writes headers, dates and periods', () => {
    expect(dayHeader('2026-10-28')).toBe('Szerda 10.28.')
    expect(formatDate('2026-10-05')).toBe('2026. október 5.')
    expect(formatPeriod(['2026-10-26', '2026-10-30'])).toBe('2026. október 26 – 30.')
    expect(formatPeriod(['2026-10-29', '2026-11-02'])).toBe('2026. október 29 – november 2.')
    expect(formatPeriod(['2026-12-28', '2027-01-01'])).toBe('2026. december 28. – 2027. január 1.')
    expect(formatPeriod(['2026-10-26'])).toBe('2026. október 26.')
    expect(groupName(2)).toBe('2. csoport')
  })
})

describe('compactDates', () => {
  it('joins consecutive days into ranges', () => {
    expect(compactDates(['2026-10-06', '2026-10-07', '2026-10-08', '2026-10-20'])).toBe('6–8., 20.')
  })
  it('never runs a range across a weekend', () => {
    const twoWeeks = [5, 6, 7, 8, 9, 12, 13, 14, 15, 16].map(
      (d) => `2026-10-${String(d).padStart(2, '0')}`,
    )
    expect(compactDates(twoWeeks)).toBe('5–9., 12–16.')
  })
  it('is empty for no dates', () => {
    expect(compactDates([])).toBe('')
  })
})

describe('leave texts', () => {
  it('says the days left, or how far over', () => {
    expect(ui.absences.balance(5)).toBe('5 maradt')
    expect(ui.absences.balance(0)).toBe('0 maradt')
    expect(ui.absences.balance(-2)).toBe('2 nappal túllépve')
  })
  it('spells out taken and total, with the carry-over only when there is one', () => {
    expect(ui.absences.balanceHint('2026', 2, 5, 2)).toBe(
      'Szabadság 2026: 2 nap kivéve, 7 összesen (5 + 2 áthozott). Kattints az áthozott napokhoz.',
    )
    expect(ui.absences.balanceHint('2026', 2, 5, 0)).toBe(
      'Szabadság 2026: 2 nap kivéve, 5 összesen. Kattints az áthozott napokhoz.',
    )
  })
})
