import { dayCapacities } from './capacity'
import type { Absence, Anchor, DayPlan, SolveInput } from './types'

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
