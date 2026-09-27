import { dayCapacities, type DayCapacity } from './capacity'
import { Lin, Milp } from './lp'
import { SHIFTS, type Shift, type SolveInput, type Staff } from './types'

/** Solve stages in strict priority order (spec §6.5). */
export const STAGES = [
  'holes',
  'substitutions',
  'worstGap',
  'totalGap',
  'switches',
  'turnarounds',
] as const
export type Stage = (typeof STAGES)[number]

/** Stages whose objective counts binaries, so the optimum is a whole number. */
export const INTEGRAL_STAGES: ReadonlySet<Stage> = new Set([
  'holes',
  'substitutions',
  'switches',
  'turnarounds',
])

/** Variable names. p indexes `people`, d indexes `days`, g is the group number (from 1). */
export const v = {
  shift: (p: number, d: number, t: Shift) => `s_${p}_${d}_${t[0]}`,
  teacherSeat: (p: number, d: number, g: number, t: Shift) => `x_${p}_${d}_${g}_${t[0]}`,
  nannySeat: (p: number, d: number, g: number) => `n_${p}_${d}_${g}`,
  substitution: (p: number, d: number, g: number) => `u_${p}_${d}_${g}`,
  open: (p: number, d: number) => `o_${p}_${d}`,
  close: (p: number, d: number) => `c_${p}_${d}`,
  holeTeacher: (d: number, g: number, t: Shift) => `ht_${d}_${g}_${t[0]}`,
  holeOpen: (d: number) => `ho_${d}`,
  holeClose: (d: number) => `hc_${d}`,
}

/** An open (not closed) day of the period. `present` holds indexes into `people`. */
export type ModelDay = { index: number; date: string; groups: number; present: number[] }

export type RosterModel = {
  milp: Milp
  objectives: Record<Stage, Lin>
  people: Staff[]
  days: ModelDay[]
  capacities: DayCapacity[]
}

export function groupNumbers(groups: number): number[] {
  return Array.from({ length: groups }, (_, i) => i + 1)
}

export function buildModel(input: SolveInput): RosterModel {
  const capacities = dayCapacities(input)
  const people = input.staff.filter((s) => s.active)
  const absent = new Set(input.absences.map((a) => `${a.staffId}|${a.date}`))
  const days: ModelDay[] = capacities
    .filter((c) => !c.closed)
    .map((c, index) => ({
      index,
      date: c.date,
      groups: c.groups,
      present: people.flatMap((s, p) => (absent.has(`${s.id}|${c.date}`) ? [] : [p])),
    }))

  const milp = new Milp()
  const objectives = Object.fromEntries(STAGES.map((stage) => [stage, new Lin()])) as Record<
    Stage,
    Lin
  >
  const isTeacher = (p: number) => people[p].role === 'teacher'
  const isPresent = (p: number, day: ModelDay) => day.present.includes(p)

  // Seat variables per day and person: all of them, and per group.
  const seats = days.map(() => people.map(() => new Lin()))
  const groupSeats = days.map(() => people.map(() => new Map<number, Lin>()))
  const inGroup = (d: number, p: number, g: number): Lin => {
    const lin = groupSeats[d][p].get(g) ?? new Lin()
    groupSeats[d][p].set(g, lin)
    return lin
  }
  const seat = (name: string, d: number, p: number, g: number) => {
    milp.binary(name)
    seats[d][p].add(name)
    inGroup(d, p, g).add(name)
    return name
  }

  // ── Strict rules (§6.2) ───────────────────────────────────────────────────
  for (const day of days) {
    const d = day.index
    const groups = groupNumbers(day.groups)
    const teachers = day.present.filter(isTeacher)
    const nannies = day.present.filter((p) => !isTeacher(p))
    // A substitution only ever fills a nanny seat no nanny can take.
    const substitutes = nannies.length < day.groups ? teachers : []

    for (const p of day.present) {
      const shifts = Lin.sum(SHIFTS.map((t) => milp.binary(v.shift(p, d, t))))
      milp.constrain(shifts, '=', 1) // present ⇒ exactly one shift
    }
    for (const p of teachers) {
      for (const t of SHIFTS) {
        const onShift = Lin.sum(groups.map((g) => seat(v.teacherSeat(p, d, g, t), d, p, g)))
        milp.constrain(onShift, '<=', new Lin().add(v.shift(p, d, t))) // teacher seat only on own shift
      }
    }
    for (const p of substitutes) {
      for (const g of groups) objectives.substitutions.add(seat(v.substitution(p, d, g), d, p, g))
    }
    for (const p of nannies) {
      for (const g of groups) seat(v.nannySeat(p, d, g), d, p, g)
      const open = milp.binary(v.open(p, d))
      const close = milp.binary(v.close(p, d))
      milp.constrain(new Lin().add(open), '<=', new Lin().add(v.shift(p, d, 'morning')))
      milp.constrain(new Lin().add(close), '<=', new Lin().add(v.shift(p, d, 'afternoon')))
    }
    for (const p of day.present) {
      if (!seats[d][p].isEmpty()) milp.constrain(seats[d][p], '<=', 1) // at most one seat a day
    }

    for (const g of groups) {
      for (const t of SHIFTS) {
        const hole = milp.binary(v.holeTeacher(d, g, t))
        objectives.holes.add(hole)
        const filled = Lin.sum(teachers.map((p) => v.teacherSeat(p, d, g, t))).add(hole)
        milp.constrain(filled, '=', 1) // each teacher seat: a person or a hole
      }
      const bothEmpty = Lin.sum(SHIFTS.map((t) => v.holeTeacher(d, g, t)))
      milp.constrain(bothEmpty, '<=', 1) // group minimum: ≥ 1 teacher
      const nannySeat = Lin.sum([
        ...nannies.map((p) => v.nannySeat(p, d, g)),
        ...substitutes.map((p) => v.substitution(p, d, g)),
      ])
      milp.constrain(nannySeat, '=', 1) // nanny seat always filled
    }

    const holeOpen = milp.binary(v.holeOpen(d))
    const holeClose = milp.binary(v.holeClose(d))
    objectives.holes.add(holeOpen).add(holeClose)
    milp.constrain(Lin.sum(nannies.map((p) => v.open(p, d))).add(holeOpen), '=', 1)
    milp.constrain(Lin.sum(nannies.map((p) => v.close(p, d))).add(holeClose), '=', 1)
  }

  // Nobody opens, or closes, on every working day of the period.
  if (days.length >= 2) {
    people.forEach((person, p) => {
      if (person.role !== 'nanny' || !days.every((day) => isPresent(p, day))) return
      milp.constrain(Lin.sum(days.map((day) => v.open(p, day.index))), '<=', days.length - 1)
      milp.constrain(Lin.sum(days.map((day) => v.close(p, day.index))), '<=', days.length - 1)
    })
  }

  return { milp, objectives, people, days, capacities }
}
