import { addDays, isWorkingDay } from '../core/calendar'
import type { Action, AppState } from './appState'

/** The working days from `from` to `to`, both included. */
export function workingDaysBetween(from: string, to: string): string[] {
  const out: string[] = []
  for (let date = from; date <= to; date = addDays(date, 1)) {
    if (isWorkingDay(date)) out.push(date)
  }
  return out
}

/**
 * "Beteg lett": marks `staffId` sick on every working day from `from` to `to`, with the actions
 * that put back exactly what those days held — nothing, or the leave she had typed.
 */
export function sickCall(
  state: AppState,
  staffId: string,
  from: string,
  to: string,
): { dates: string[]; action: Action; inverse: Action[] } {
  const dates = workingDaysBetween(from, to)
  const before = state.absences.filter((a) => a.staffId === staffId && dates.includes(a.date))
  return {
    dates,
    action: { type: 'setAbsent', staffId, dates, absent: true, kind: 'sick' },
    inverse: [
      { type: 'setAbsent', staffId, dates, absent: false },
      ...before.map((a): Action => ({
        type: 'setAbsent',
        staffId,
        dates: [a.date],
        absent: true,
        kind: a.kind,
      })),
    ],
  }
}
