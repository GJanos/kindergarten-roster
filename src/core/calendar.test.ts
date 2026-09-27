import { describe, expect, it } from 'vitest'
import { addDays, weekday } from './calendar'

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
