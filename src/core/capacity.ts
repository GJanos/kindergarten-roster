import type { SolveInput } from './types'

export type DayCapacity = {
  date: string
  teachers: number // active teachers present
  nannies: number // active nannies present
  requested: number
  override?: number
  gMax: number
  groups: number // effective count
  closed: boolean // she set 0 groups: nobody works that day
}

/** Groups a day can start: each needs its own teacher, and every nanny seat a nanny or a spare teacher. */
export function gMax(teachers: number, nannies: number): number {
  return Math.min(teachers, Math.floor((teachers + nannies) / 2))
}

export function dayCapacities(input: SolveInput): DayCapacity[] {
  const absent = new Set(input.absences.map((a) => `${a.staffId}|${a.date}`))
  return input.period.days.map((date) => {
    const plan = input.dayPlans.find((p) => p.date === date)
    if (!plan) throw new Error(`No day plan for ${date}`)
    const present = input.staff.filter((s) => s.active && !absent.has(`${s.id}|${date}`))
    const teachers = present.filter((s) => s.role === 'teacher').length
    const nannies = present.length - teachers
    const max = gMax(teachers, nannies)
    return {
      date,
      teachers,
      nannies,
      requested: plan.requestedGroups,
      override: plan.override,
      gMax: max,
      // An override above g_max would make the strict rules unsatisfiable, so it is capped too.
      groups: Math.min(plan.override ?? plan.requestedGroups, max),
      closed: plan.override === 0,
    }
  })
}

/** Staff a day needs for zero holes: two teachers per group, a nanny per group, two nannies for the keys. */
export function zeroHoleNeeds(groups: number): { teachers: number; nannies: number } {
  return { teachers: 2 * groups, nannies: Math.max(groups, 2) }
}

/** The largest group count below `below` that leaves no teacher seat empty, if any. */
export function groupsWithoutTeacherHoles(
  teachers: number,
  nannies: number,
  below: number,
): number | undefined {
  for (let groups = below - 1; groups >= 1; groups--) {
    // Substitutes fill the nanny seats nannies cannot, and each one takes a teacher.
    if (teachers >= 2 * groups + Math.max(0, groups - nannies)) return groups
  }
  return undefined
}
