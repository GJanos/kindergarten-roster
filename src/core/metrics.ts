import { addDays } from './calendar'
import type { Assignment, Roster, SolveInput } from './types'

export type GroupSwitch = {
  staffId: string
  from: string
  to: string
  fromGroup: number
  toGroup: number
}
export type Turnaround = { staffId: string; late: string; early: string }

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
