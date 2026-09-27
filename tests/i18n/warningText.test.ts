import { describe, expect, it } from 'vitest'
import { warningText as t } from '../../src/i18n/hu'

const WED = '2026-10-28'

describe('warning texts', () => {
  it('matches the examples in the spec', () => {
    expect(t.noTeacher(WED)).toBe('Szerdán nincs óvónő — egy csoport sem indítható.')
    expect(t.callIn(['Anna', 'Bea'])).toBe('Hívj be valakit: Anna, Bea (távol).')
    expect(t.callIn([])).toBe('Hívj be valakit.')
    expect(t.teacherSeatEmpty(WED, 2, 'afternoon', '10:30–17:00')).toBe(
      'Szerda, 2. cs.: nincs délutános óvónő (10:30–17:00).',
    )
    expect(t.keyMissing(WED, 'opener', 1)).toBe('Szerdán nincs nyitó — csak 1 dajka dolgozik.')
    expect(t.keyMissing(WED, 'closer', 0)).toBe('Szerdán nincs záró — nincs dajka.')
    expect(t.groupsOverridden(WED, 1)).toBe('Szerda: 1 csoport (kézi beállítás).')
    expect(t.substitution(WED, 1, 'Cili')).toBe('Szerda, 1. cs.: dajka helyett óvónő — Cili.')
    expect(t.closedDay(WED)).toBe('Szerdán zárva.')
    expect(t.turnaround('Nóra', '2026-10-27', WED)).toBe('Nóra kedden 18:00-ig, szerdán 6:00-tól.')
  })

  it('names merged groups with the right article', () => {
    expect(t.groupsReduced(WED, 1, 2, 3, 1)).toBe(
      'Szerdán 1 csoport indul 2 helyett (3 óvónő, 1 dajka). A 2. cs. összevonva az 1.-vel.',
    )
    expect(t.groupsReduced(WED, 2, 4, 5, 2)).toBe(
      'Szerdán 2 csoport indul 4 helyett (5 óvónő, 2 dajka). A 3. és 4. cs. összevonva a többivel.',
    )
    expect(t.groupsReduced(WED, 4, 5, 8, 4)).toBe(
      'Szerdán 4 csoport indul 5 helyett (8 óvónő, 4 dajka). Az 5. cs. összevonva a többivel.',
    )
    expect(t.groupSwitch('Dalma', '2026-10-29', 2)).toBe('Dalma csütörtöktől a 2. csoportban.')
    expect(t.groupSwitch('Dalma', '2026-10-29', 1)).toBe('Dalma csütörtöktől az 1. csoportban.')
  })

  it('adds the year so far when it is a whole day or more either way', () => {
    expect(t.uneven('Nóra', { kind: 'afternoon', count: 3, of: 5 }, 2)).toBe(
      'Egyenlő elosztás nem volt lehetséges: Nóra 3 délutános műszak az 5-ből. Idén eddig 2 délutánnal több jutott neki.',
    )
    expect(t.uneven('Kati', { kind: 'opener', count: 2, of: 3 }, -1.5)).toBe(
      'Egyenlő elosztás nem volt lehetséges: Kati 2 napon nyit a 3-ból. Idén eddig 2 nyitással kevesebb jutott neki.',
    )
    expect(t.uneven('Bea', { kind: 'reserve', count: 3, of: 4 }, 0.5)).toBe(
      'Egyenlő elosztás nem volt lehetséges: Bea 3 napon tartalék a 4-ből.',
    )
  })

  it('counts out of the period with the right suffix', () => {
    expect(t.uneven('Nóra', { kind: 'afternoon', count: 3, of: 5 })).toBe(
      'Egyenlő elosztás nem volt lehetséges: Nóra 3 délutános műszak az 5-ből.',
    )
    expect(t.uneven('Kati', { kind: 'opener', count: 2, of: 3 })).toBe(
      'Egyenlő elosztás nem volt lehetséges: Kati 2 napon nyit a 3-ból.',
    )
    expect(t.uneven('Bea', { kind: 'reserve', count: 3, of: 4 })).toBe(
      'Egyenlő elosztás nem volt lehetséges: Bea 3 napon tartalék a 4-ből.',
    )
  })
})
