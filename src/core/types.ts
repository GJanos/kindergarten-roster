export type Role = 'teacher' | 'nanny'
export type Shift = 'morning' | 'afternoon'
export const SHIFTS: readonly Shift[] = ['morning', 'afternoon']

/** The four fairness counts (spec §6.3). */
export type GapKind = 'morning' | 'opener' | 'closer' | 'reserve'

/** Per person (staff id), per kind: count minus fair share — one roster's, or a year's sum. */
export type Balance = Record<string, Partial<Record<GapKind, number>>>

export type Staff = {
  id: string
  fullName: string
  displayName: string
  role: Role
  active: boolean
  deleted?: true // deleted after appearing in a roster: hidden, kept so old weeks keep the name
  leaveAllowance?: number // leave days per calendar year; absent = not tracked (v2)
  leaveCarry?: Record<string, number> // days carried into a calendar year ('2026' → 3), typed by her
}
export type AbsenceKind = 'leave' | 'sick' | 'other' // szabadság, beteg, egyéb
export type Absence = { staffId: string; date: string; kind: AbsenceKind } // one row per absent day

export type Period = { start: string; days: string[] } // working days only, 1–6 of them
export type DayPlan = { date: string; requestedGroups: number; override?: number } // override 0 = closed

/** Groups are numbered from 1, as on the wall. */
export type Seat =
  { kind: 'teacher'; group: number; shift: Shift } | { kind: 'nanny'; group: number }

export type Assignment = {
  staffId: string
  date: string
  shift: Shift
  seat?: Seat // absent seat = reserve
  substitution?: true // teacher in a nanny seat
  opener?: true
  closer?: true
}

export type Hole =
  | { kind: 'teacherSeat'; date: string; group: number; shift: Shift }
  | { kind: 'opener' | 'closer'; date: string }

export type WarningCode =
  | 'NO_TEACHER'
  | 'TEACHER_SEAT_EMPTY'
  | 'OPENER_MISSING'
  | 'CLOSER_MISSING'
  | 'GROUPS_REDUCED'
  | 'GROUPS_OVERRIDDEN'
  | 'SUBSTITUTION'
  | 'CLOSED_DAY'
  | 'GROUP_SWITCH'
  | 'TURNAROUND'
  | 'UNEVEN'

export type Severity = 'red' | 'orange' | 'grey'

export type Warning = {
  code: WarningCode
  severity: Severity
  date: string
  text: string // Hungarian, ready to show
  action?: string // Hungarian suggestion
  fix?: { kind: 'setGroups'; date: string; groups: number } // one-click button
  cells: { staffId?: string; date: string; group?: number }[] // for hover highlight
}

export type Roster = {
  period: Period
  groupsPerDay: Record<string, number> // effective count after g_max/override
  assignments: Assignment[]
  holes: Hole[]
  warnings: Warning[]
  edited?: true // changed by hand after solving (v2 swaps); re-solving drops the edits
  balance?: Balance // its fairness deltas, summed into the yearly balance (v2)
  stoppedEarly?: string // a solver stage that ran out of time: valid, but maybe not the best
  solvedAt: string
  appVersion: string
}

/** Everything a solve needs. Inactive staff are ignored. */
export type SolveInput = {
  staff: Staff[]
  absences: Absence[]
  period: Period
  dayPlans: DayPlan[] // one per period day
  history?: Balance // the kindergarten year's earlier rosters, summed; the last tie-break (v2)
}

/**
 * Re-plan a week in progress from `from` on (the sick-call recalculation, v2): days before it stay
 * as `roster` has them. 'minimal' changes as few people as it can; 'full' re-plans the rest freely.
 */
export type Anchor = { roster: Roster; from: string; mode: 'minimal' | 'full' }

export type RosterMeta = { solvedAt: string; appVersion: string }
