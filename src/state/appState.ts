import { periodForWeek } from '../core/calendar'
import type { Absence, DayPlan, Role, Roster, Staff } from '../core/types'

export const SCHEMA_VERSION = 2
export const DEFAULT_GROUPS = 2

export type PeriodState = {
  dayPlans: DayPlan[]
  groupLabels?: string[]
  roster?: Roster
  /** Fingerprint of the input the roster was solved from; a mismatch means it is out of date. */
  rosterInputKey?: string
}

/** Spec §9, plus `demo` (the banner) and `rosterInputKey` (stale-roster notice). */
export type AppState = {
  schemaVersion: typeof SCHEMA_VERSION
  demo?: true
  staff: Staff[]
  absences: Absence[]
  periods: Record<string, PeriodState> // keyed by the week's Monday
  lastBackupAt?: string
}

export function emptyState(): AppState {
  return { schemaVersion: SCHEMA_VERSION, staff: [], absences: [], periods: {} }
}

export type Action =
  | { type: 'addStaff'; id: string; role?: Role }
  | { type: 'updateStaff'; id: string; patch: Partial<Omit<Staff, 'id'>> }
  | { type: 'deleteStaff'; id: string }
  | { type: 'setAbsent'; staffId: string; dates: string[]; absent: boolean }
  | { type: 'setGroups'; week: string; groups: number }
  | { type: 'setOverride'; week: string; date: string; groups?: number }
  | { type: 'setGroupLabel'; week: string; group: number; label: string }
  | { type: 'saveRoster'; week: string; roster: Roster; inputKey: string }
  | { type: 'restoreRoster'; week: string; roster?: Roster; inputKey?: string } // undo
  | { type: 'markBackedUp'; at: string }

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'addStaff': {
      const person: Staff = {
        id: action.id,
        fullName: '',
        displayName: '',
        role: action.role ?? 'teacher',
        active: true,
      }
      return { ...state, staff: [...state.staff, person] }
    }
    case 'updateStaff':
      return {
        ...state,
        staff: state.staff.map((s) => (s.id === action.id ? patchStaff(s, action.patch) : s)),
      }
    case 'deleteStaff':
      // Someone a saved roster mentions stays behind the scenes, so old weeks keep the name.
      if (isRostered(state, action.id)) {
        return {
          ...state,
          staff: state.staff.map((s) =>
            s.id === action.id ? { ...s, active: false, deleted: true as const } : s,
          ),
        }
      }
      return {
        ...state,
        staff: state.staff.filter((s) => s.id !== action.id),
        absences: state.absences.filter((a) => a.staffId !== action.id),
      }
    case 'setAbsent': {
      const dates = new Set(action.dates)
      const kept = state.absences.filter((a) => a.staffId !== action.staffId || !dates.has(a.date))
      const added = action.absent
        ? [...dates].map((date) => ({ staffId: action.staffId, date, kind: 'leave' as const }))
        : []
      return { ...state, absences: [...kept, ...added] }
    }
    case 'setGroups':
      return updatePeriod(state, action.week, (p) => ({
        ...p,
        dayPlans: p.dayPlans.map((d) => ({ ...d, requestedGroups: action.groups })),
      }))
    case 'setOverride':
      return updatePeriod(state, action.week, (p) => ({
        ...p,
        dayPlans: p.dayPlans.map((d) =>
          d.date !== action.date
            ? d
            : action.groups === undefined
              ? { date: d.date, requestedGroups: d.requestedGroups }
              : { ...d, override: action.groups },
        ),
      }))
    case 'setGroupLabel':
      return updatePeriod(state, action.week, (p) => {
        const labels = Array.from(
          { length: Math.max(p.groupLabels?.length ?? 0, action.group) },
          (_, i) => p.groupLabels?.[i] ?? '',
        )
        labels[action.group - 1] = action.label
        return { ...p, groupLabels: labels }
      })
    case 'saveRoster':
      return updatePeriod(state, action.week, (p) => ({
        ...p,
        roster: action.roster,
        rosterInputKey: action.inputKey,
      }))
    case 'restoreRoster':
      return updatePeriod(state, action.week, ({ roster: _, rosterInputKey: __, ...p }) =>
        action.roster ? { ...p, roster: action.roster, rosterInputKey: action.inputKey } : p,
      )
    case 'markBackedUp':
      return { ...state, lastBackupAt: action.at }
  }
}

/** The display name follows the full name until she changes it. */
function patchStaff(staff: Staff, patch: Partial<Omit<Staff, 'id'>>): Staff {
  const next = { ...staff, ...patch }
  if (
    patch.fullName !== undefined &&
    patch.displayName === undefined &&
    staff.displayName === staff.fullName
  ) {
    next.displayName = patch.fullName
  }
  return next
}

export function isRostered(state: AppState, staffId: string): boolean {
  return Object.values(state.periods).some((p) =>
    p.roster?.assignments.some((a) => a.staffId === staffId),
  )
}

/** A week's stored plan, fitted to the current calendar (a yearly update may add or drop a day). */
export function periodState(state: AppState, week: string): PeriodState {
  const stored = state.periods[week]
  const groups = stored?.dayPlans[0]?.requestedGroups ?? latestGroupCount(state, week)
  const dayPlans = periodForWeek(week).days.map(
    (date) => stored?.dayPlans.find((d) => d.date === date) ?? { date, requestedGroups: groups },
  )
  return { ...stored, dayPlans }
}

export function groupCount(period: PeriodState): number {
  return period.dayPlans[0]?.requestedGroups ?? DEFAULT_GROUPS
}

/** A new week starts with the group count of the latest earlier week. */
function latestGroupCount(state: AppState, week: string): number {
  const earlier = Object.keys(state.periods)
    .filter((key) => key < week && state.periods[key].dayPlans.length > 0)
    .sort()
  const latest = earlier.at(-1)
  return latest ? state.periods[latest].dayPlans[0].requestedGroups : DEFAULT_GROUPS
}

function updatePeriod(
  state: AppState,
  week: string,
  change: (p: PeriodState) => PeriodState,
): AppState {
  return { ...state, periods: { ...state.periods, [week]: change(periodState(state, week)) } }
}
