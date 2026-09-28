import { describe, expect, it } from 'vitest'
import { ui } from '../../src/i18n/hu'

describe('recalculation texts', () => {
  it('names a sick call by its dates', () => {
    expect(ui.recalc.didSick('Kati', '2026-10-28', '2026-10-28')).toBe('Kati beteg: 10.28.')
    expect(ui.recalc.didSick('Kati', '2026-10-28', '2026-10-30')).toBe('Kati beteg: 10.28.–10.30.')
  })

  it('asks until when, from the picked day', () => {
    expect(ui.recalc.sickUntil('Kati', '2026-10-27')).toBe('Kati beteg keddtől — meddig?')
  })

  it('counts the people whose day changed', () => {
    expect(ui.recalc.changedPeople(0)).toBe('Senki más beosztása nem változott.')
    expect(ui.recalc.changedPeople(2)).toBe('2 munkatárs beosztása változott:')
  })

  it('describes a day by its hours, place and key', () => {
    const date = '2026-10-28'
    expect(
      ui.recalc.dayText('nanny', {
        staffId: 'n1',
        date,
        shift: 'morning',
        seat: { kind: 'nanny', group: 2 },
        opener: true,
      }),
    ).toBe('DE 6:00–14:00, 2. cs., nyit')
    expect(
      ui.recalc.dayText('teacher', { staffId: 't1', date: '2026-10-30', shift: 'afternoon' }),
    ).toBe('DU 11:00–17:00, csoporton kívül')
    expect(
      ui.recalc.change(
        'Bea',
        date,
        true,
        'DE 7:00–13:30, 1. cs.',
        'DU 10:30–17:00, csoporton kívül',
      ),
    ).toBe('Bea: ma DE 7:00–13:30, 1. cs. (eddig DU 10:30–17:00, csoporton kívül)')
    expect(ui.recalc.change('Bea', date, false, 'x', 'y')).toBe('Bea: szerdán x (eddig y)')
  })
})
