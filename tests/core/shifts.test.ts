import { describe, expect, it } from 'vitest'
import { shiftTimes } from '../../src/core/shifts'

describe('shiftTimes', () => {
  it('gives nannies the same times every day', () => {
    expect(shiftTimes('nanny', 'morning', '2026-10-30')).toBe('6:00–14:00')
    expect(shiftTimes('nanny', 'afternoon', '2026-10-26')).toBe('10:00–18:00')
  })

  it('shortens teacher shifts on Fridays and working Saturdays', () => {
    expect(shiftTimes('teacher', 'morning', '2026-10-29')).toBe('7:00–13:30')
    expect(shiftTimes('teacher', 'afternoon', '2026-10-29')).toBe('10:30–17:00')
    expect(shiftTimes('teacher', 'morning', '2026-10-30')).toBe('7:00–13:00')
    expect(shiftTimes('teacher', 'afternoon', '2026-12-12')).toBe('11:00–17:00')
  })

  it('shifts an ügyelet teacher 30 minutes: earlier in the morning, later in the afternoon', () => {
    expect(shiftTimes('teacher', 'morning', '2026-10-29', true)).toBe('6:30–13:00')
    expect(shiftTimes('teacher', 'afternoon', '2026-10-29', true)).toBe('11:00–17:30')
    expect(shiftTimes('teacher', 'morning', '2026-10-30', true)).toBe('6:30–12:30')
    expect(shiftTimes('teacher', 'afternoon', '2026-12-12', true)).toBe('11:30–17:30')
    expect(shiftTimes('nanny', 'morning', '2026-10-29', true)).toBe('6:00–14:00')
  })

  it('gives helpers 8–16, or 6–14 / 10–18 when they stand in, Fridays too (v3-c)', () => {
    expect(shiftTimes('assistant', 'day', '2026-10-29')).toBe('8:00–16:00')
    expect(shiftTimes('civil', 'morning', '2026-10-30')).toBe('6:00–14:00')
    // A DU ügyelet already fits in 10–18: her hours don't move.
    expect(shiftTimes('assistant', 'afternoon', '2026-10-30', true)).toBe('10:00–18:00')
  })

  it('has no day shift for teachers and nannies', () => {
    expect(() => shiftTimes('teacher', 'day', '2026-10-29')).toThrow(/No day shift/)
  })
})
