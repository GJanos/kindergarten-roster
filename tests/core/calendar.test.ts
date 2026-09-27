import { describe, expect, it } from 'vitest'
import {
  addDays,
  defaultWeek,
  isWorkingDay,
  mondayOf,
  periodForWeek,
  usesFridayTimes,
  weekday,
} from '../../src/core/calendar'

describe('addDays and weekday', () => {
  it('moves across month and year ends and the October clock change', () => {
    expect(addDays('2026-10-30', 3)).toBe('2026-11-02')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
    expect(addDays('2026-10-24', 2)).toBe('2026-10-26')
  })

  it('knows the weekday', () => {
    expect(weekday('2026-10-26')).toBe(1)
    expect(weekday('2026-10-31')).toBe(6)
    expect(weekday('2026-11-01')).toBe(0)
  })
})

describe('the Hungarian calendar', () => {
  it('skips weekends and holidays and keeps working Saturdays', () => {
    expect(isWorkingDay('2026-10-26')).toBe(true)
    expect(isWorkingDay('2026-10-23')).toBe(false) // national holiday
    expect(isWorkingDay('2026-10-24')).toBe(false) // Saturday
    expect(isWorkingDay('2026-12-12')).toBe(true) // worked for Christmas Eve
    expect(isWorkingDay('2026-12-24')).toBe(false) // bridge day
  })

  it('builds the period of a week', () => {
    expect(periodForWeek('2026-10-26')).toEqual({
      start: '2026-10-26',
      days: ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30'],
    })
    expect(periodForWeek('2026-10-19').days).toHaveLength(4)
    expect(periodForWeek('2026-12-21').days).toEqual(['2026-12-21', '2026-12-22', '2026-12-23'])
    expect(periodForWeek('2026-12-07').days).toEqual([
      '2026-12-07',
      '2026-12-08',
      '2026-12-09',
      '2026-12-10',
      '2026-12-11',
      '2026-12-12',
    ])
  })

  it('finds the Monday of a week', () => {
    expect(mondayOf('2026-10-26')).toBe('2026-10-26')
    expect(mondayOf('2026-10-28')).toBe('2026-10-26')
    expect(mondayOf('2026-11-01')).toBe('2026-10-26')
  })

  it('uses Friday times on Fridays and working Saturdays', () => {
    expect(usesFridayTimes('2026-10-30')).toBe(true)
    expect(usesFridayTimes('2026-12-12')).toBe(true)
    expect(usesFridayTimes('2026-10-29')).toBe(false)
  })

  it('opens the roster on the next break week', () => {
    expect(defaultWeek('2026-10-01')).toBe('2026-10-26')
    expect(defaultWeek('2026-10-28')).toBe('2026-10-26')
    expect(defaultWeek('2026-11-05')).toBe('2026-12-21')
  })
})
