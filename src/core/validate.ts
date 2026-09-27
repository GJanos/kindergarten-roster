import { dayCapacities } from './capacity'
import { SHIFTS, type Roster, type SolveInput } from './types'

export type Violation = { rule: string; date?: string; staffId?: string }

function groupNumbers(groups: number): number[] {
  return Array.from({ length: groups }, (_, i) => i + 1)
}

/**
 * Re-checks every strict rule (§6.2) on a finished roster, independently of the
 * solver. Any hit is a bug: the app never shows or prints such a roster.
 */
export function validateRoster(input: SolveInput, roster: Roster): Violation[] {
  const out: Violation[] = []
  const fail = (rule: string, date?: string, staffId?: string) => out.push({ rule, date, staffId })
  const people = new Map(input.staff.filter((s) => s.active).map((s) => [s.id, s]))
  const absent = new Set(input.absences.map((a) => `${a.staffId}|${a.date}`))
  const capacities = dayCapacities(input)

  if (roster.period.days.join() !== input.period.days.join()) fail('period')
  for (const a of roster.assignments) {
    if (!input.period.days.includes(a.date)) fail('assignmentOutsidePeriod', a.date, a.staffId)
    if (!people.has(a.staffId)) fail('unknownOrInactiveStaff', a.date, a.staffId)
  }

  for (const cap of capacities) {
    const date = cap.date
    const today = roster.assignments.filter((a) => a.date === date)
    const holes = roster.holes.filter((h) => h.date === date)
    if (roster.groupsPerDay[date] !== cap.groups) fail('groupCount', date)
    if (cap.closed) {
      if (today.length > 0 || holes.length > 0) fail('closedDayNotEmpty', date)
      continue
    }

    for (const person of people.values()) {
      const count = today.filter((a) => a.staffId === person.id).length
      const isAbsent = absent.has(`${person.id}|${date}`)
      if (isAbsent && count > 0) fail('absentButWorking', date, person.id)
      if (!isAbsent && count !== 1) fail('presentNeedsExactlyOneShift', date, person.id)
    }

    for (const a of today) {
      const role = people.get(a.staffId)?.role
      if (!a.seat) {
        if (a.substitution) fail('substitutionWithoutSeat', date, a.staffId)
      } else if (a.seat.group < 1 || a.seat.group > cap.groups) {
        fail('seatInMissingGroup', date, a.staffId)
      } else if (a.seat.kind === 'teacher') {
        if (role !== 'teacher') fail('nannyInTeacherSeat', date, a.staffId)
        if (a.seat.shift !== a.shift) fail('teacherSeatOffShift', date, a.staffId)
      } else if ((role === 'teacher') !== (a.substitution === true)) {
        fail('substitutionFlag', date, a.staffId)
      }
      if ((a.opener || a.closer) && role !== 'nanny') fail('keyNotNanny', date, a.staffId)
      if (a.opener && a.shift !== 'morning') fail('openerNotMorning', date, a.staffId)
      if (a.closer && a.shift !== 'afternoon') fail('closerNotAfternoon', date, a.staffId)
    }

    for (const g of groupNumbers(cap.groups)) {
      let emptyTeacherSeats = 0
      for (const t of SHIFTS) {
        const holders = today.filter(
          (a) => a.seat?.kind === 'teacher' && a.seat.group === g && a.seat.shift === t,
        ).length
        const empty = holes.filter(
          (h) => h.kind === 'teacherSeat' && h.group === g && h.shift === t,
        ).length
        if (holders + empty !== 1) fail('teacherSeatNotFilledOnce', date)
        emptyTeacherSeats += empty
      }
      if (emptyTeacherSeats > 1) fail('groupWithoutTeacher', date)
      const nannies = today.filter((a) => a.seat?.kind === 'nanny' && a.seat.group === g).length
      if (nannies !== 1) fail('nannySeatNotFilledOnce', date)
    }
    for (const h of holes) {
      if (h.kind === 'teacherSeat' && (h.group < 1 || h.group > cap.groups)) {
        fail('holeInMissingGroup', date)
      }
    }
    for (const key of ['opener', 'closer'] as const) {
      const holders = today.filter((a) => a[key]).length
      const empty = holes.filter((h) => h.kind === key).length
      if (holders + empty !== 1) fail(`${key}NotExactlyOne`, date)
    }
  }

  const openDays = capacities.filter((c) => !c.closed).length
  if (openDays >= 2) {
    for (const person of people.values()) {
      for (const key of ['opener', 'closer'] as const) {
        const days = roster.assignments.filter((a) => a.staffId === person.id && a[key]).length
        if (days === openDays) fail(`${key}EveryDay`, undefined, person.id)
      }
    }
  }
  return out
}
