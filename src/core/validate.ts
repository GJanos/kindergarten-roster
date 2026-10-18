import { dayCapacities } from './capacity'
import { SHIFTS, isHelper, type Roster, type SolveInput } from './types'

export type Violation = { rule: string; date?: string; staffId?: string }

function groupNumbers(groups: number): number[] {
  return Array.from({ length: groups }, (_, i) => i + 1)
}

/**
 * Re-checks every strict rule (§6.2, helpers since v3-c) on a finished roster, independently of the
 * solver. Any hit is a bug: the app never shows or prints such a roster.
 */
export function validateRoster(input: SolveInput, roster: Roster): Violation[] {
  const out: Violation[] = []
  const fail = (rule: string, date?: string, staffId?: string) => out.push({ rule, date, staffId })
  const people = new Map(input.staff.filter((s) => s.active).map((s) => [s.id, s]))
  const absent = new Set(input.absences.map((a) => `${a.staffId}|${a.date}`))
  const capacities = dayCapacities(input)
  // Ügyelet (v3-b): a roster from before it has neither duty nor a duty hole, and is left alone.
  const tracksDuty =
    roster.assignments.some((a) => a.duty) || roster.holes.some((h) => h.kind === 'duty')

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
      if (a.shift === 'day' && !(role && isHelper(role))) fail('dayShiftNotHelper', date, a.staffId)
      if (!a.seat) {
        if (a.substitution) fail('substitutionWithoutSeat', date, a.staffId)
      } else if (a.seat.group < 1 || a.seat.group > cap.groups) {
        fail('seatInMissingGroup', date, a.staffId)
      } else if (a.seat.kind === 'helper') {
        // Beside the DE teacher, on any hours she was given (v3-c).
        if (role !== 'assistant') fail('helperSeatNotAssistant', date, a.staffId)
        if (a.substitution) fail('substitutionFlag', date, a.staffId)
      } else if (a.seat.kind === 'teacher') {
        if (role === 'nanny') fail('nannyInTeacherSeat', date, a.staffId)
        if (role === 'civil') fail('civilInTeacherSeat', date, a.staffId)
        if (role === 'assistant' && (a.seat.shift !== 'afternoon' || a.shift !== 'afternoon'))
          fail('assistantNotAfternoon', date, a.staffId)
        if (a.seat.shift !== a.shift) fail('teacherSeatOffShift', date, a.staffId)
        if ((role === 'assistant') !== (a.substitution === true))
          fail('substitutionFlag', date, a.staffId)
      } else {
        if (role === 'assistant') fail('assistantInNannySeat', date, a.staffId)
        if (role === 'civil' && a.shift === 'day') fail('standInOnDay', date, a.staffId)
        if ((role !== 'nanny') !== (a.substitution === true))
          fail('substitutionFlag', date, a.staffId)
      }
      // A nanny holds a key, or a civil standing in for one (v3-c).
      const keyHolder = role === 'nanny' || (role === 'civil' && a.seat?.kind === 'nanny')
      if ((a.opener || a.closer) && !keyHolder) fail('keyNotNanny', date, a.staffId)
      if (a.opener && a.shift !== 'morning') fail('openerNotMorning', date, a.staffId)
      if (a.closer && a.shift !== 'afternoon') fail('closerNotAfternoon', date, a.staffId)
    }

    for (const g of groupNumbers(cap.groups)) {
      let teachersSeated = 0
      for (const t of SHIFTS) {
        const seated = today.filter(
          (a) => a.seat?.kind === 'teacher' && a.seat.group === g && a.seat.shift === t,
        )
        const empty = holes.filter(
          (h) => h.kind === 'teacherSeat' && h.group === g && h.shift === t,
        ).length
        if (seated.length + empty !== 1) fail('teacherSeatNotFilledOnce', date)
        teachersSeated += seated.filter((a) => people.get(a.staffId)?.role === 'teacher').length
      }
      // Group minimum: a real teacher, whoever else stands in (v3-c).
      if (teachersSeated === 0) fail('groupWithoutTeacher', date)
      const besides = today.filter((a) => a.seat?.kind === 'helper' && a.seat.group === g)
      if (besides.length > 1) fail('helperSeatTwice', date)
      const deTeacher = today.some(
        (a) =>
          a.seat?.kind === 'teacher' &&
          a.seat.group === g &&
          a.seat.shift === 'morning' &&
          people.get(a.staffId)?.role === 'teacher',
      )
      if (besides.length > 0 && !deTeacher) fail('helperWithoutTeacher', date)
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
    if (tracksDuty) {
      for (const a of today) {
        if (a.duty && a.seat?.kind !== 'teacher') fail('dutyOffTeacherSeat', date, a.staffId)
      }
      const dutyGroups = new Set(
        today.flatMap((a) => (a.duty && a.seat?.kind === 'teacher' ? [a.seat.group] : [])),
      )
      const dutyHoles = holes.filter((h) => h.kind === 'duty').length
      if (cap.groups > 0 && dutyGroups.size + dutyHoles !== 1) fail('dutyNotExactlyOne', date)
      for (const g of dutyGroups) {
        const seated = today.filter((a) => a.seat?.kind === 'teacher' && a.seat.group === g)
        if (seated.length !== 2 || seated.some((a) => !a.duty)) fail('dutyGroupIncomplete', date)
      }
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
