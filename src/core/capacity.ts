import type { Role, SolveInput } from './types'

export type DayCapacity = {
  date: string
  teachers: number // active teachers present
  nannies: number // active nannies present
  assistants: number // pedagógiai asszisztens present (v3-c)
  civils: number // civils present (v3-c)
  requested: number
  override?: number
  gMax: number
  groups: number // effective count
  closed: boolean // she set 0 groups: nobody works that day
}

type Headcount = Pick<DayCapacity, 'teachers' | 'nannies' | 'assistants' | 'civils'>
type Day = Headcount & { groups: number }

/**
 * Groups a day can start: each needs its own teacher, and every nanny seat a nanny, a civil or a
 * spare teacher (civils since v3-c). An asszisztens can't start a group: it needs its DE teacher.
 */
export function gMax(teachers: number, nannies: number, civils = 0): number {
  return Math.min(teachers, Math.floor((teachers + nannies + civils) / 2))
}

/** Civils in nanny seats: only where the nannies run out, and before any teacher (v3-c). */
export function civilStandIns(c: Day): number {
  return Math.min(c.civils, Math.max(0, c.groups - c.nannies))
}

/** Teachers in nanny seats: the seats no nanny or civil fills. */
export function teacherStandIns(c: Day): number {
  return Math.max(0, c.groups - c.nannies - c.civils)
}

/** Teachers left for teacher seats. */
export function seatedTeachers(c: Day): number {
  return c.teachers - teacherStandIns(c)
}

/**
 * Asszisztens in DU teacher seats: only when a teacher seat would stay empty, one per group that
 * has a single teacher (who then takes DE) (v3-c).
 */
export function assistantStandIns(c: Day): number {
  const missing = 2 * c.groups - seatedTeachers(c)
  return missing > 0 ? Math.min(c.assistants, missing) : 0
}

/** Who covers `zeroHoleNeeds`: an asszisztens a DU teacher seat, a civil a nanny seat (v3-c). */
export function cover(c: Headcount): { teachers: number; nannies: number } {
  return { teachers: c.teachers + c.assistants, nannies: c.nannies + c.civils }
}

export function dayCapacities(input: SolveInput): DayCapacity[] {
  const absent = new Set(input.absences.map((a) => `${a.staffId}|${a.date}`))
  return input.period.days.map((date) => {
    const plan = input.dayPlans.find((p) => p.date === date)
    if (!plan) throw new Error(`No day plan for ${date}`)
    const present = input.staff.filter((s) => s.active && !absent.has(`${s.id}|${date}`))
    const count = (role: Role) => present.filter((s) => s.role === role).length
    const teachers = count('teacher')
    const nannies = count('nanny')
    const assistants = count('assistant')
    const civils = count('civil')
    const max = gMax(teachers, nannies, civils)
    return {
      date,
      teachers,
      nannies,
      assistants,
      civils,
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

/** The largest group count below the day's that leaves no teacher seat empty, if any. */
export function groupsWithoutTeacherHoles(c: Day): number | undefined {
  for (let groups = c.groups - 1; groups >= 1; groups--) {
    const day = { ...c, groups }
    if (seatedTeachers(day) + assistantStandIns(day) >= 2 * groups) return groups
  }
  return undefined
}

/**
 * The red problems a solved day shows: empty teacher seats, missing keys, a missing ügyelet, or
 * no teacher at all. Holes are the solve's first stage, so they follow from the headcount alone;
 * the quick-fix preview counts on that (2026-10-18), and the property tests hold it to the solver.
 * It counts the helpers who fill seats too (v3-c).
 */
export function expectedHoles(c: DayCapacity): number {
  if (c.closed) return 0
  // A nanny, or a civil standing in, opens or closes, never both.
  const keys = Math.max(0, 2 - c.nannies - civilStandIns(c))
  if (c.gMax === 0) return 1 + keys
  const seated = seatedTeachers(c)
  const assistants = assistantStandIns(c)
  const seats = Math.max(0, 2 * c.groups - seated - assistants)
  // Ügyelet needs one group with its DE teacher and a DU teacher or asszisztens.
  const duty = seated > c.groups || assistants > 0 ? 0 : 1
  return seats + keys + duty
}
