import { addDays } from './calendar'
import type { Assignment, Role, Roster, Shift, SolveInput } from './types'

export type GroupSwitch = {
  staffId: string
  from: string
  to: string
  fromGroup: number
  toGroup: number
}
export type Turnaround = { staffId: string; late: string; early: string }
export type PairClash = { date: string; group: number; shift: Shift }
export type ShiftImbalance = { date: string; role: Role; morning: number; afternoon: number }

/** Days the kindergarten is open: every period day except those she set to 0 groups. */
function openDays(input: SolveInput, roster: Roster): string[] {
  const closed = new Set(input.dayPlans.filter((p) => p.override === 0).map((p) => p.date))
  return roster.period.days.filter((date) => !closed.has(date))
}

function byPersonAndDay(roster: Roster): Map<string, Assignment> {
  return new Map(roster.assignments.map((a) => [`${a.staffId}|${a.date}`, a]))
}

/** Someone seated in one group and, on the next open day, seated in another (§6.4). */
export function groupSwitches(input: SolveInput, roster: Roster): GroupSwitch[] {
  const days = openDays(input, roster)
  const at = byPersonAndDay(roster)
  const out: GroupSwitch[] = []
  for (let i = 0; i + 1 < days.length; i++) {
    for (const person of input.staff) {
      const today = at.get(`${person.id}|${days[i]}`)?.seat
      const tomorrow = at.get(`${person.id}|${days[i + 1]}`)?.seat
      if (today && tomorrow && today.group !== tomorrow.group) {
        out.push({
          staffId: person.id,
          from: days[i],
          to: days[i + 1],
          fromGroup: today.group,
          toGroup: tomorrow.group,
        })
      }
    }
  }
  return out
}

/** A nanny working until 18:00 and from 6:00 the next calendar day. */
export function turnarounds(input: SolveInput, roster: Roster): Turnaround[] {
  const at = byPersonAndDay(roster)
  const out: Turnaround[] = []
  for (const person of input.staff.filter((s) => s.role === 'nanny')) {
    for (const late of roster.period.days) {
      const early = addDays(late, 1)
      if (
        at.get(`${person.id}|${late}`)?.shift === 'afternoon' &&
        at.get(`${person.id}|${early}`)?.shift === 'morning'
      ) {
        out.push({ staffId: person.id, late, early })
      }
    }
  }
  return out
}

/** Groups 1–2, 3–4…: both nannies on the same shift (v3-b). */
export function pairClashes(input: SolveInput, roster: Roster): PairClash[] {
  const out: PairClash[] = []
  for (const date of openDays(input, roster)) {
    const nannyOf = (g: number) =>
      roster.assignments.find(
        (a) => a.date === date && a.seat?.kind === 'nanny' && a.seat.group === g,
      )
    for (let g = 1; g + 1 <= (roster.groupsPerDay[date] ?? 0); g += 2) {
      const first = nannyOf(g)
      const second = nannyOf(g + 1)
      if (first && second && first.shift === second.shift) {
        out.push({ date, group: g, shift: first.shift })
      }
    }
  }
  return out
}

/** A day whose teachers, or nannies, reserves included, split 2 or more apart between DE and DU (v3-b). */
export function shiftImbalances(input: SolveInput, roster: Roster): ShiftImbalance[] {
  const roleOf = new Map(input.staff.map((s) => [s.id, s.role]))
  const out: ShiftImbalance[] = []
  for (const date of openDays(input, roster)) {
    for (const role of ['teacher', 'nanny'] as const) {
      const today = roster.assignments.filter(
        (a) => a.date === date && roleOf.get(a.staffId) === role,
      )
      const morning = today.filter((a) => a.shift === 'morning').length
      const afternoon = today.length - morning
      if (Math.abs(morning - afternoon) >= 2) out.push({ date, role, morning, afternoon })
    }
  }
  return out
}
