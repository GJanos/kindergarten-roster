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
      ],
    }
    expect(migrate(structuredClone(state))).toEqual(state)
  })

  it.each([
    ['not an object', 'hello'],
    ['an unknown version', { ...emptyState(), schemaVersion: 99 }],
    ['broken staff', { ...emptyState(), staff: [{ id: 1 }] }],
    [
      'a broken deleted flag',
      {
        ...emptyState(),
        staff: [
          {
            id: 'a',
            fullName: 'A',
            displayName: 'A',
            role: 'nanny',
            active: false,
            deleted: 'yes',
          },
        ],
      },
    ],
    ['broken absences', { ...emptyState(), absences: 'none' }],
    ['no periods', { ...emptyState(), periods: [] }],
  ])('rejects %s', (_, raw) => {
    expect(() => migrate(raw)).toThrow(InvalidDataError)
  })
})
