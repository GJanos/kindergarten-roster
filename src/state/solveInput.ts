import { periodForWeek } from '../core/calendar'
import type { SolveInput } from '../core/types'
import { periodState, type AppState } from './appState'

export function solveInputFor(state: AppState, week: string): SolveInput {
  const period = periodForWeek(week)
  const days = new Set(period.days)
  return {
    staff: state.staff.filter((s) => s.active),
    absences: state.absences.filter((a) => days.has(a.date)),
    period,
    dayPlans: periodState(state, week).dayPlans,
  }
}

/** A fingerprint of what the roster depends on. Names are left out: they only change the display. */
export function inputKey(input: SolveInput): string {
  const text = JSON.stringify({
    staff: input.staff.map((s) => `${s.id}|${s.role}|${s.active}`).sort(),
    absences: input.absences.map((a) => `${a.staffId}|${a.date}`).sort(),
    days: input.period.days,
    plans: input.dayPlans.map((d) => [d.date, d.requestedGroups, d.override ?? null]),
  })
  let hash = 0x811c9dc5 // FNV-1a
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193)
  return (hash >>> 0).toString(16)
}
