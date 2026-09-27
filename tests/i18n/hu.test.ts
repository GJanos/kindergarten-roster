import { describe, expect, it } from 'vitest'
import {
  dayHeader,
  dayName,
  formatDate,
  formatPeriod,
  fromDay,
  groupName,
  onDay,
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
