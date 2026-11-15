// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { emptyState, reducer, type Action } from '../../src/state/appState'
import { AbsenceGrid } from '../../src/ui/AbsenceGrid'
import { makeStaff } from '../core/fixtures'

afterEach(cleanup)

const WEEK = '2026-10-26'
const DAYS = ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30']
const CLOSED = '2026-10-30'

function setup(extra: Action[]) {
  const people = makeStaff(4, 2)
  let state = emptyState()
  for (const person of people)
    state = reducer(state, { type: 'addStaff', id: person.id, role: person.role })
  state = reducer(state, { type: 'setGroups', week: WEEK, groups: 2 })
  for (const action of extra) state = reducer(state, action)
  state = reducer(state, {
    type: 'setAbsent',
    staffId: 't1',
    dates: [CLOSED],
    absent: true,
    kind: 'leave',
  })
  state = reducer(state, {
    type: 'setAbsent',
    staffId: 't2',
    dates: [CLOSED],
    absent: true,
    kind: 'leave',
  })
  render(<AbsenceGrid state={state} dispatch={vi.fn()} people={people} days={DAYS} brush="leave" />)
  return {
    teacher: screen.getByLabelText(`Távol (óvónő) ${CLOSED}`),
    nanny: screen.getByLabelText(`Távol (dajka) ${CLOSED}`),
  }
}

describe('AbsenceGrid coverage', () => {
  it('marks a day short against the week groups', () => {
    const { teacher, nanny } = setup([])
    expect(teacher.className).toContain('short')
    expect(nanny.className).not.toContain('short') // both nannies are still there
  })

  it('does not mark a closed day short, however many are away', () => {
    const { teacher, nanny } = setup([
      { type: 'setOverride', week: WEEK, date: CLOSED, groups: 0 },
      { type: 'setAbsent', staffId: 'n1', dates: [CLOSED], absent: true, kind: 'leave' },
    ])
    expect(teacher.className).not.toContain('short')
    expect(nanny.className).not.toContain('short')
    expect(teacher.getAttribute('title')).toBeNull()
    expect(nanny.getAttribute('title')).toBeNull()
  })

  it('judges a day set to one group by its own count', () => {
    const { teacher } = setup([{ type: 'setOverride', week: WEEK, date: CLOSED, groups: 1 }])
    expect(teacher.className).not.toContain('short')
  })
})
