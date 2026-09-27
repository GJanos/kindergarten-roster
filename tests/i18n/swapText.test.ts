import { describe, expect, it } from 'vitest'
import { ui } from '../../src/i18n/hu'

describe('swap texts', () => {
  it('give the most telling reason first', () => {
    expect(ui.roster.swapRefused(['keyNotNanny', 'nannyInTeacherSeat'])).toBe(
      'Ez a csere nem lehetséges: dajka nem ülhet óvónői helyre.',
    )
    expect(ui.roster.swapRefused(['openerEveryDay'])).toBe(
      'Ez a csere nem lehetséges: így valaki minden nap nyitna.',
    )
  })

  it('fall back to a general reason', () => {
    expect(ui.roster.swapRefused(['somethingElse'])).toBe(
      'Ez a csere nem lehetséges: megszegne egy szabályt.',
    )
  })

  it('name the swap and the selection', () => {
    expect(ui.roster.didSwap('Anna', 'Bea', '2026-10-28')).toBe('Csere: Anna ↔ Bea, szerda.')
    expect(ui.roster.picked('Anna', '2026-10-28')).toBe(
      'Anna kiválasztva (szerda) — kattints arra, akivel cserél.',
    )
  })
})
