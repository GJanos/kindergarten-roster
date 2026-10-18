import { dayCapacities } from './capacity'
import { Lin } from './lp'
import { groupNumbers, v, type RosterModel } from './model'
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
  const { milp, objectives, people, days, seats, duty } = model
  const planned = new Map(anchor.roster.assignments.map((a) => [`${a.staffId}|${a.date}`, a]))
  const declared = new Set(milp.binaries)
  const later = days.filter((day) => day.date >= anchor.from)
  const changedPerson = new Map<number, string>()
  const holdsKeys = (p: number, d: number) => declared.has(v.open(p, d))

  /** The variable of the anchor's seat, if this model has that seat. */
  const seatOf = (p: number, d: number, a: Assignment): string | undefined => {
    if (!a.seat) return undefined
    const name =
      a.seat.kind === 'teacher'
        ? v.teacherSeat(p, d, a.seat.group, a.seat.shift)
        : a.seat.kind === 'helper'
          ? v.helperSeat(p, d, a.seat.group)
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
    if (day.date < anchor.from && day.groups > 0) {
      // The anchor's ügyelet group that day; none (a pre-v3-b roster, or a duty hole) pins the hole.
      const dutyGroup = anchor.roster.assignments.find((a) => a.date === day.date && a.duty)?.seat
        ?.group
      for (const g of groupNumbers(day.groups)) {
        milp.constrain(new Lin().add(v.dutyGroup(d, g)), '=', g === dutyGroup ? 1 : 0)
      }
    }
    for (const p of day.present) {
      const a = planned.get(`${people[p].id}|${day.date}`)
      if (day.date < anchor.from) {
        // recalcInput made the present exactly the anchor's people, so each has a day to keep.
        if (!a) throw new Error(`Nothing to keep for ${people[p].id} on ${day.date}`)
        const shift = v.shift(p, d, a.shift)
        if (!declared.has(shift))
          throw new Error(`No ${a.shift} shift for ${people[p].id} on ${day.date}`)
        milp.constrain(new Lin().add(shift), '=', 1)
        const seat = seatOf(p, d, a)
        if (a.seat && !seat) throw new Error(`No such seat for ${people[p].id} on ${day.date}`)
        if (seat) milp.constrain(new Lin().add(seat), '=', 1)
        else if (!seats[d][p].isEmpty()) milp.constrain(new Lin().plus(seats[d][p]), '=', 0)
        if (holdsKeys(p, d)) {
          milp.constrain(new Lin().add(v.open(p, d)), '=', a.opener ? 1 : 0)
          milp.constrain(new Lin().add(v.close(p, d)), '=', a.closer ? 1 : 0)
        }
        continue
      }
      if (anchor.mode !== 'minimal' || !a) continue

      const hours = milp.nonNegative(v.keptHours(p, d))
      const kept = v.shift(p, d, a.shift)
      // A shift this person can no longer have (a role changed since) is a change too.
      milp.constrain(
        new Lin().add(hours),
        '>=',
        declared.has(kept) ? differs(kept, true) : Lin.constant(1),
      )
      // Ügyelet moves the hours by 30 minutes: a change is a phone call too.
      if (!duty[d][p].isEmpty()) {
        const dutyDiffers = a.duty
          ? Lin.constant(1).plus(duty[d][p], -1)
          : new Lin().plus(duty[d][p])
        milp.constrain(new Lin().add(hours), '>=', dutyDiffers)
      }
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
      if (holdsKeys(p, d)) {
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
  hours: boolean // the shift or the ügyelet changed, not just the seat or the key
}

const seatKey = (a: Assignment) =>
  a.seat ? `${a.seat.kind}${a.seat.group}${a.seat.kind === 'teacher' ? a.seat.shift : ''}` : ''

const sameDay = (a: Assignment, b: Assignment) =>
  a.shift === b.shift &&
  seatKey(a) === seatKey(b) &&
  !a.opener === !b.opener &&
  !a.closer === !b.closer &&
  !a.duty === !b.duty &&
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
        hours: then.shift !== now.shift || !then.duty !== !now.duty,
      },
    ]
  })
}
