import { ui } from '../i18n/hu'
import type { Action, AppState } from '../state/appState'
import type { DayFix } from './warningDays'

/** The same button: one group count of a day, or one person called in on a day. */
export function sameFix(a: DayFix, b: DayFix): boolean {
  if (a.date !== b.date) return false
  if (a.kind === 'setGroups') return b.kind === 'setGroups' && a.groups === b.groups
  return b.kind === 'callIn' && a.staffId === b.staffId
}

/**
 * A click on a fix button (2026-10-18): selects it, or deselects it if already selected. A day
 * has one group count, so a new count replaces the one chosen before; call-ins add up.
 */
export function toggleFix(pending: DayFix[], fix: DayFix): DayFix[] {
  if (pending.some((p) => sameFix(p, fix))) return pending.filter((p) => !sameFix(p, fix))
  const kept =
    fix.kind === 'setGroups'
      ? pending.filter((p) => p.kind !== 'setGroups' || p.date !== fix.date)
      : pending
  return [...kept, fix]
}

/** What applying `fixes` dispatches, how undo puts it all back, and the undo bar's label. */
export function fixActions(
  state: AppState,
  week: string,
  fixes: DayFix[],
): { actions: Action[]; inverse: Action[]; label: string } {
  const actions: Action[] = []
  const inverse: Action[] = []
  const labels: string[] = []
  for (const fix of fixes) {
    const { date } = fix
    if (fix.kind === 'setGroups') {
      const previous = state.periods[week]?.dayPlans.find((d) => d.date === date)?.override
      actions.push({ type: 'setOverride', week, date, groups: fix.groups })
      inverse.push({ type: 'setOverride', week, date, groups: previous })
      labels.push(ui.roster.didSetGroups(date, fix.groups))
    } else {
      const { staffId } = fix
      // Undo puts the absence back as it was: leave stays leave, sick stays sick.
      const kind = state.absences.find((a) => a.staffId === staffId && a.date === date)?.kind
      actions.push({ type: 'setAbsent', staffId, dates: [date], absent: false })
      inverse.push({ type: 'setAbsent', staffId, dates: [date], absent: true, kind })
      labels.push(ui.roster.didCallIn(fix.name, date))
    }
  }
  const label =
    labels.length === 1 ? labels[0] : ui.roster.didFixes(labels.map((l) => l.replace(/\.$/, '')))
  return { actions, inverse: inverse.reverse(), label }
}
