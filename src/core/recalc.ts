import { dayCapacities } from './capacity'
import { Lin } from './lp'
import { v, type RosterModel } from './model'
import type { Absence, Anchor, Assignment, DayPlan, Roster, SolveInput } from './types'

/**
 * The input a recalculation solves. Days before `anchor.from` are history: who worked them, and
 * in how many groups, is read from the anchor roster rather than from today's absences, so an
 * absence typed in afterwards can neither break nor rewrite a past day. Undefined when the anchor
 * cannot be kept: another period, or a past day worked by someone no longer active.
 */
export function recalcInput(input: SolveInput, anchor: Anchor): SolveInput | undefined {
  const { roster, from } = anchor
  if (roster.period.days.join() !== input.period.days.join()) return undefined
  const kept = new Set(input.period.days.filter((date) => date < from))
  const active = new Set(input.staff.filter((s) => s.active).map((s) => s.id))
  const worked = new Set<string>()
  const workedOn = new Set<string>()
  for (const a of roster.assignments) {
    if (!kept.has(a.date)) continue
    if (!active.has(a.staffId)) return undefined
    worked.add(`${a.staffId}|${a.date}`)
    workedOn.add(a.date)
  }

  const kindOf = new Map(input.absences.map((a) => [`${a.staffId}|${a.date}`, a.kind]))
  const absences: Absence[] = [
    ...input.absences.filter((a) => !kept.has(a.date)),
    ...[...kept].flatMap((date) =>
      [...active]
        .filter((staffId) => !worked.has(`${staffId}|${date}`))
        .map((staffId) => ({
          staffId,
          date,
          kind: kindOf.get(`${staffId}|${date}`) ?? ('other' as const),
        })),
    ),
  ]
  const derived = { ...input, absences }
  const groups = new Map(dayCapacities(derived).map((c) => [c.date, c.groups]))
  const dayPlans: DayPlan[] = input.dayPlans.map((plan) => {
    if (!kept.has(plan.date)) return plan
    // Nobody worked it: it was closed (or had nobody), and stays so.
    if (!workedOn.has(plan.date)) return { ...plan, override: 0 }
    const had = roster.groupsPerDay[plan.date]
    return groups.get(plan.date) === had ? plan : { ...plan, override: had }
  })
  return { ...derived, dayPlans }
}

/**
 * Ties a model to its anchor (spec §6.5). Days before `from` are fixed as the anchor has them. In
 * 'minimal' mode every later difference costs, in three stages: people whose hours change, then
 * those days (an earlier one costs more — today's phone calls are the hardest), then seat and key
 * moves at unchanged hours. Someone the anchor had off (a call-in) is placed freely.
 */
export function anchorModel(model: RosterModel, anchor: Anchor): void {
  const { milp, objectives, people, days, seats } = model
  const planned = new Map(anchor.roster.assignments.map((a) => [`${a.staffId}|${a.date}`, a]))
  const declared = new Set(milp.binaries)
  const later = days.filter((day) => day.date >= anchor.from)
  const changedPerson = new Map<number, string>()
  const isNanny = (p: number) => people[p].role === 'nanny'

  /** The variable of the anchor's seat, if this model has that seat. */
  const seatOf = (p: number, d: number, a: Assignment): string | undefined => {
    if (!a.seat) return undefined
    const name =
      a.seat.kind === 'teacher'
        ? v.teacherSeat(p, d, a.seat.group, a.seat.shift)
        : a.substitution
          ? v.substitution(p, d, a.seat.group)
          : v.nannySeat(p, d, a.seat.group)
    return declared.has(name) ? name : undefined
  }
  /** 1 when the binary `name` is not `want`, else 0. */
  const differs = (name: string, want: boolean) =>
    want ? Lin.constant(1).add(name, -1) : new Lin().add(name)

  for (const day of days) {
    const d = day.index
    for (const p of day.present) {
      const a = planned.get(`${people[p].id}|${day.date}`)
      if (day.date < anchor.from) {
        // recalcInput made the present exactly the anchor's people, so each has a day to keep.
        if (!a) throw new Error(`Nothing to keep for ${people[p].id} on ${day.date}`)
        milp.constrain(new Lin().add(v.shift(p, d, a.shift)), '=', 1)
        const seat = seatOf(p, d, a)
        if (a.seat && !seat) throw new Error(`No such seat for ${people[p].id} on ${day.date}`)
        if (seat) milp.constrain(new Lin().add(seat), '=', 1)
        else if (!seats[d][p].isEmpty()) milp.constrain(new Lin().plus(seats[d][p]), '=', 0)
        if (isNanny(p)) {
          milp.constrain(new Lin().add(v.open(p, d)), '=', a.opener ? 1 : 0)
          milp.constrain(new Lin().add(v.close(p, d)), '=', a.closer ? 1 : 0)
        }
        continue
      }
      if (anchor.mode !== 'minimal' || !a) continue

      const hours = milp.nonNegative(v.keptHours(p, d))
      milp.constrain(new Lin().add(hours), '>=', differs(v.shift(p, d, a.shift), true))
      objectives.keepHours.add(hours, later.length - later.indexOf(day))
      let person = changedPerson.get(p)
      if (!person) {
        person = milp.nonNegative(v.keptPerson(p))
        changedPerson.set(p, person)
        objectives.keepPeople.add(person)
      }
      milp.constrain(new Lin().add(person), '>=', new Lin().add(hours))

      const duties = milp.nonNegative(v.keptDuties(p, d))
      const seat = seatOf(p, d, a)
      const moved = a.seat
        ? seat
          ? differs(seat, true)
          : Lin.constant(1) // the anchor's group is gone today
        : new Lin().plus(seats[d][p])
      milp.constrain(new Lin().add(duties), '>=', moved)
      if (isNanny(p)) {
        milp.constrain(new Lin().add(duties), '>=', differs(v.open(p, d), a.opener === true))
        milp.constrain(new Lin().add(duties), '>=', differs(v.close(p, d), a.closer === true))
      }
      objectives.keepDuties.add(duties)
    }
  }
}

export type ScheduleChange = {
  staffId: string
  date: string
  before: Assignment
  after: Assignment
  hours: boolean // the shift changed, not just the seat or the key
}

const seatKey = (a: Assignment) =>
  a.seat ? `${a.seat.kind}${a.seat.group}${a.seat.kind === 'teacher' ? a.seat.shift : ''}` : ''

const sameDay = (a: Assignment, b: Assignment) =>
  a.shift === b.shift &&
  seatKey(a) === seatKey(b) &&
  !a.opener === !b.opener &&
  !a.closer === !b.closer &&
  !a.substitution === !b.substitution

/** Days from `from` on that someone works both before and after, but differently. */
export function scheduleChanges(before: Roster, after: Roster, from: string): ScheduleChange[] {
  const was = new Map(before.assignments.map((a) => [`${a.staffId}|${a.date}`, a]))
  return after.assignments.flatMap((now) => {
    const then = was.get(`${now.staffId}|${now.date}`)
    if (now.date < from || !then || sameDay(then, now)) return []
    return [
      {
        staffId: now.staffId,
        date: now.date,
        before: then,
        after: now,
        hours: then.shift !== now.shift,
      },
    ]
  })
}
