import { describe, expect, it } from 'vitest'
import type { Assignment } from '../../src/core/types'
import { ui } from '../../src/i18n/hu'

const WED = '2026-10-28'
const at = (rest: Omit<Assignment, 'staffId' | 'date'>): Assignment => ({
  staffId: 'x',
  date: WED,
  ...rest,
})

describe('recalculation texts', () => {
  it('names a sick call by its dates', () => {
    expect(ui.recalc.didSick('Kati', WED, WED)).toBe('Kati beteg: 10.28.')
    expect(ui.recalc.didSick('Kati', WED, '2026-10-30')).toBe('Kati beteg: 10.28.–10.30.')
  })

  it('asks until when, from the picked day', () => {
    expect(ui.recalc.sickUntil('Kati', '2026-10-27')).toBe('Kati beteg keddtől — meddig?')
  })

  it('heads the people to phone apart from those to tell', () => {
    expect(ui.recalc.callTitle(2)).toBe('2 munkatárs ideje változott — őket érdemes felhívni:')
    expect(ui.recalc.tellTitle(1)).toBe('1 munkatársnak csak a helye vagy a kulcsa változott:')
    expect(ui.recalc.unchanged).toBe('Senki más beosztása nem változott.')
  })

  it('names an ügyelet taken on, with its times', () => {
    const was = at({ shift: 'morning', seat: { kind: 'teacher', group: 1, shift: 'morning' } })
    expect(ui.recalc.day('teacher', was, { ...was, duty: true }, false)).toBe(
      'szerda: DE ügyelet 6:30–13:00 (eddig nem ügyeletes), 1. cs.',
    )
  })

  it('gives new hours with the old shift, and the place', () => {
    const was = at({ shift: 'afternoon' })
    const now = at({ shift: 'morning', seat: { kind: 'teacher', group: 1, shift: 'morning' } })
    expect(ui.recalc.day('teacher', was, now, true)).toBe('ma: DE 7:00–13:30 (eddig DU), 1. cs.')
  })

  it('gives only the move when the hours stay', () => {
    const was = at({ shift: 'afternoon', seat: { kind: 'nanny', group: 2 }, closer: true })
    const now = at({ shift: 'afternoon', closer: true })
    expect(ui.recalc.day('nanny', was, now, false)).toBe('szerda: csoporton kívül (eddig 2. cs.)')
  })

  it('says when someone takes on or gives up a key', () => {
    const was = at({ shift: 'afternoon', seat: { kind: 'nanny', group: 1 }, closer: true })
    const now = at({ shift: 'morning', seat: { kind: 'nanny', group: 1 }, opener: true })
    expect(ui.recalc.day('nanny', was, now, false)).toBe(
      'szerda: DE 6:00–14:00 (eddig DU), 1. cs., nyit, nem zár',
    )
    expect(
      ui.recalc.day(
        'nanny',
        at({ shift: 'morning', opener: true }),
        at({ shift: 'morning' }),
        true,
      ),
    ).toBe('ma: nem nyit')
  })

  it('joins one person’s days on one line', () => {
    expect(ui.recalc.person('Kati', ['ma: nem nyit', 'kedd: 1. cs. (eddig csoporton kívül)'])).toBe(
      'Kati — ma: nem nyit · kedd: 1. cs. (eddig csoporton kívül)',
    )
  })

  it('names an asszisztens standing in, with her new hours (v3-c)', () => {
    const was = {
      staffId: 'a1',
      date: '2026-10-28',
      shift: 'day' as const,
      seat: { kind: 'helper' as const, group: 1 },
    }
    const now = {
      staffId: 'a1',
      date: '2026-10-28',
      shift: 'afternoon' as const,
      seat: { kind: 'teacher' as const, group: 2, shift: 'afternoon' as const },
      substitution: true as const,
    }
    expect(ui.recalc.day('assistant', was, now, false)).toBe(
      'szerda: DU 10:00–18:00 (eddig NAP), 2. cs., óvónő helyett',
    )
  })
})
