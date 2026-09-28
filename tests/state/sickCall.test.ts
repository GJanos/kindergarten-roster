import { describe, expect, it } from 'vitest'
import { makeStaff } from '../core/fixtures'
import { emptyState, reducer } from '../../src/state/appState'
import { sickCall } from '../../src/state/sickCall'

// N1 already has a day of leave on Thursday.
const state = reducer(
  { ...emptyState(), staff: makeStaff(1, 1) },
  { type: 'setAbsent', staffId: 'n1', dates: ['2026-10-29'], absent: true, kind: 'leave' },
)

describe('sickCall', () => {
  it('marks every working day of the range sick, the weekend skipped', () => {
    const call = sickCall(state, 'n1', '2026-10-29', '2026-11-03')
    expect(call.dates).toEqual(['2026-10-29', '2026-10-30', '2026-11-02', '2026-11-03'])
    expect(call.action).toEqual({
      type: 'setAbsent',
      staffId: 'n1',
      dates: call.dates,
      absent: true,
      kind: 'sick',
    })
  })

  it('undoes to exactly what those days held before', () => {
    const call = sickCall(state, 'n1', '2026-10-28', '2026-10-30')
    const back = call.inverse.reduce(reducer, reducer(state, call.action))
    expect(back.absences).toEqual(state.absences)
  })
})
