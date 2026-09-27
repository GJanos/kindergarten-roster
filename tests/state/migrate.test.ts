import { describe, expect, it } from 'vitest'
import { emptyState } from '../../src/state/appState'
import { InvalidDataError, migrate } from '../../src/state/migrate'

describe('migrate', () => {
  it('accepts current data unchanged', () => {
    const state = {
      ...emptyState(),
      staff: [
        { id: 'a', fullName: 'A', displayName: 'A', role: 'nanny', active: true },
        { id: 'b', fullName: 'B', displayName: 'B', role: 'teacher', active: false, deleted: true },
        {
          id: 'c',
          fullName: 'C',
          displayName: 'C',
          role: 'teacher',
          active: true,
          leaveAllowance: 50,
          leaveCarry: { '2026': 4 },
        },
      ],
      absences: [
        { staffId: 'a', date: '2026-10-26', kind: 'leave' },
        { staffId: 'c', date: '2026-10-27', kind: 'sick' },
      ],
    }
    expect(migrate(structuredClone(state))).toEqual(state)
  })

  it('brings v1 data to v2, every absence as leave', () => {
    const v1 = {
      schemaVersion: 1,
      staff: [],
      absences: [{ staffId: 'a', date: '2026-10-26' }],
      periods: {},
    }
    expect(migrate(v1)).toEqual({
      schemaVersion: 2,
      staff: [],
      absences: [{ staffId: 'a', date: '2026-10-26', kind: 'leave' }],
      periods: {},
    })
  })

  const staffWith = (extra: object) => ({
    ...emptyState(),
    staff: [{ id: 'a', fullName: 'A', displayName: 'A', role: 'nanny', active: true, ...extra }],
  })

  it.each([
    ['not an object', 'hello'],
    ['an unknown version', { ...emptyState(), schemaVersion: 99 }],
    ['broken staff', { ...emptyState(), staff: [{ id: 1 }] }],
    ['a broken deleted flag', staffWith({ active: false, deleted: 'yes' })],
    ['a negative leave allowance', staffWith({ leaveAllowance: -1 })],
    ['a broken carry-over', staffWith({ leaveCarry: { '2026': 'sok' } })],
    ['broken absences', { ...emptyState(), absences: 'none' }],
    [
      'an absence of an unknown kind',
      { ...emptyState(), absences: [{ staffId: 'a', date: '2026-10-26', kind: 'vacation' }] },
    ],
    ['no periods', { ...emptyState(), periods: [] }],
  ])('rejects %s', (_, raw) => {
    expect(() => migrate(raw)).toThrow(InvalidDataError)
  })
})
