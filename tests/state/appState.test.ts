import { describe, expect, it } from 'vitest'
import { TEST_META } from '../core/fixtures'
import type { Roster } from '../../src/core/types'
import {
  emptyState,
  groupCount,
  isRostered,
  periodState,
  reducer,
  type Action,
  type AppState,
} from '../../src/state/appState'

const WEEK = '2026-10-26'
const run = (state: AppState, ...actions: Action[]) => actions.reduce(reducer, state)
const withAnna = () =>
  run(
    emptyState(),
    { type: 'addStaff', id: 'a' },
    { type: 'updateStaff', id: 'a', patch: { fullName: 'Kiss Anna' } },
  )

describe('staff', () => {
  it('adds a teacher and lets the display name follow the full name', () => {
    const state = withAnna()
    expect(state.staff).toEqual([
      { id: 'a', fullName: 'Kiss Anna', displayName: 'Kiss Anna', role: 'teacher', active: true },
    ])
  })

  it('keeps a shortened display name when the full name changes', () => {
    const state = run(
      withAnna(),
      { type: 'updateStaff', id: 'a', patch: { displayName: 'Anna' } },
      { type: 'updateStaff', id: 'a', patch: { fullName: 'Kiss Anna Mária' } },
    )
    expect(state.staff[0].displayName).toBe('Anna')
  })

  it('deletes someone never rostered, with their absences', () => {
    const state = run(
      withAnna(),
      { type: 'setAbsent', staffId: 'a', dates: ['2026-10-26'], absent: true },
      { type: 'deleteStaff', id: 'a' },
    )
    expect(state.staff).toEqual([])
    expect(state.absences).toEqual([])
  })

  it('hides someone a saved roster mentions but keeps their name for the old weeks', () => {
    const roster: Roster = {
      period: { start: WEEK, days: [WEEK] },
      groupsPerDay: { [WEEK]: 0 },
      assignments: [{ staffId: 'a', date: WEEK, shift: 'morning' }],
      holes: [],
      warnings: [],
      ...TEST_META,
    }
    const state = run(
      withAnna(),
      { type: 'setAbsent', staffId: 'a', dates: ['2026-10-27'], absent: true },
      { type: 'saveRoster', week: WEEK, roster, inputKey: 'k' },
    )
    expect(isRostered(state, 'a')).toBe(true)
    const deleted = run(state, { type: 'deleteStaff', id: 'a' })
    expect(deleted.staff).toEqual([{ ...state.staff[0], active: false, deleted: true }])
    expect(deleted.absences).toEqual(state.absences)
  })

  it('adds a nanny when asked for one', () => {
    const state = run(emptyState(), { type: 'addStaff', id: 'n', role: 'nanny' })
    expect(state.staff[0].role).toBe('nanny')
  })
})

describe('absences', () => {
  it('marks and clears days without duplicates', () => {
    const marked = run(
      withAnna(),
      { type: 'setAbsent', staffId: 'a', dates: ['2026-10-26', '2026-10-27'], absent: true },
      { type: 'setAbsent', staffId: 'a', dates: ['2026-10-26'], absent: true },
    )
    expect(marked.absences).toHaveLength(2)
    const cleared = run(marked, {
      type: 'setAbsent',
      staffId: 'a',
      dates: ['2026-10-26'],
      absent: false,
    })
    expect(cleared.absences).toEqual([{ staffId: 'a', date: '2026-10-27' }])
  })
})

describe('periods', () => {
  it('puts back an earlier roster, or none, for undo', () => {
    const roster: Roster = {
      period: { start: WEEK, days: [WEEK] },
      groupsPerDay: { [WEEK]: 1 },
      assignments: [],
      holes: [],
      warnings: [],
      ...TEST_META,
    }
    const saved = run(emptyState(), { type: 'saveRoster', week: WEEK, roster, inputKey: 'new' })
    const back = run(saved, { type: 'restoreRoster', week: WEEK, roster, inputKey: 'old' })
    expect(back.periods[WEEK].rosterInputKey).toBe('old')
    const none = run(saved, { type: 'restoreRoster', week: WEEK })
    expect(none.periods[WEEK].roster).toBeUndefined()
    expect(none.periods[WEEK].rosterInputKey).toBeUndefined()
    expect(none.periods[WEEK].dayPlans).toEqual(saved.periods[WEEK].dayPlans)
  })

  it('fits a new week to the calendar with the default group count', () => {
    const period = periodState(emptyState(), WEEK)
    expect(period.dayPlans.map((d) => d.date)).toEqual([
      '2026-10-26',
      '2026-10-27',
      '2026-10-28',
      '2026-10-29',
      '2026-10-30',
    ])
    expect(groupCount(period)).toBe(2)
  })

  it('starts a new week with the latest earlier group count', () => {
    const state = run(emptyState(), { type: 'setGroups', week: WEEK, groups: 3 })
    expect(groupCount(periodState(state, '2026-12-21'))).toBe(3)
  })

  it('sets and clears a day override', () => {
    const set = run(emptyState(), {
      type: 'setOverride',
      week: WEEK,
      date: '2026-10-28',
      groups: 1,
    })
    expect(periodState(set, WEEK).dayPlans[2]).toEqual({
      date: '2026-10-28',
      requestedGroups: 2,
      override: 1,
    })
    const cleared = run(set, { type: 'setOverride', week: WEEK, date: '2026-10-28' })
    expect(periodState(cleared, WEEK).dayPlans[2]).toEqual({
      date: '2026-10-28',
      requestedGroups: 2,
    })
  })

  it('stores group labels without gaps', () => {
    const state = run(emptyState(), { type: 'setGroupLabel', week: WEEK, group: 2, label: 'Süni' })
    expect(state.periods[WEEK].groupLabels).toEqual(['', 'Süni'])
  })
})
