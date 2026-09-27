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
