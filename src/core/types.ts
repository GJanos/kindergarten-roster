export type Role = 'teacher' | 'nanny'
export type Shift = 'morning' | 'afternoon'
export const SHIFTS: readonly Shift[] = ['morning', 'afternoon']

export type Staff = {
  id: string
  fullName: string
  displayName: string
  role: Role
  active: boolean
  deleted?: true // deleted after appearing in a roster: hidden, kept so old weeks keep the name
}
export type Absence = { staffId: string; date: string } // ISO date, one row per absent day

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
  solvedAt: string
  appVersion: string
}

/** Everything a solve needs. Inactive staff are ignored. */
export type SolveInput = {
  staff: Staff[]
  absences: Absence[]
  period: Period
  dayPlans: DayPlan[] // one per period day
}

export type RosterMeta = { solvedAt: string; appVersion: string }
