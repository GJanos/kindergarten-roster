import { addDays } from './calendar'
import { dayCapacities, type DayCapacity } from './capacity'
import { fairShares, totalGapFloor, worstGapFloor, type GapKind } from './fairness'
import { Lin, Milp } from './lp'
import { SHIFTS, type Shift, type SolveInput, type Staff } from './types'

/**
 * Solve stages in strict priority order (spec §6.5, reordered in v3-b). The keep* stages only
 * count in a recalculation of a week in progress (v2-F); 'yearly' is the v2 tie-break. Her v3-b
 * rules: nanny pairs before fairness, the daily DE/DU balance after it, the keys last.
 */
export const STAGES = [
  'holes',
  'substitutions',
  'keepPeople',
  'keepHours',
  'keepDuties',
  'pairs',
  'worstGap',
  'totalGap',
  'balance',
  'switches',
  'turnarounds',
  'keysSeated',
  'keysGap',
  'yearly',
] as const
export type Stage = (typeof STAGES)[number]

/** Stages whose objective counts binaries, so the optimum is a whole number. */
export const INTEGRAL_STAGES: ReadonlySet<Stage> = new Set([
  'holes',
  'substitutions',
  'keepPeople',
  'keepHours',
  'keepDuties',
  'pairs',
  'balance',
  'switches',
  'turnarounds',
  'keysSeated',
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
  gap: (kind: GapKind, p: number) => `g${kind[0]}_${p}`,
  worstGap: 'worst',
  switch: (p: number, d: number) => `sw_${p}_${d}`,
  turnaround: (p: number, d: number) => `tu_${p}_${d}`,
  keptPerson: (p: number) => `kp_${p}`,
  keptHours: (p: number, d: number) => `kh_${p}_${d}`,
  keptDuties: (p: number, d: number) => `kd_${p}_${d}`,
  dutyGroup: (d: number, g: number) => `y_${d}_${g}`,
  holeDuty: (d: number) => `hd_${d}`,
  onDuty: (p: number, d: number, g: number, t: Shift) => `z_${p}_${d}_${g}_${t[0]}`,
  nannyShift: (d: number, g: number, t: Shift) => `ns_${d}_${g}_${t[0]}`,
  pairClash: (d: number, g: number) => `pc_${d}_${g}`,
  imbalance: (d: number, role: 'teacher' | 'nanny', step: 1 | 2) => `e${step}_${d}_${role[0]}`,
  keyFromReserve: (key: 'open' | 'close', p: number, d: number) => `k${key[0]}_${p}_${d}`,
}

/** An open (not closed) day of the period. `present` holds indexes into `people`. */
export type ModelDay = { index: number; date: string; groups: number; present: number[] }

export type RosterModel = {
  milp: Milp
  objectives: Record<Stage, Lin>
  people: Staff[]
  days: ModelDay[]
  capacities: DayCapacity[]
  /** Per day, per person: the sum of their seat variables (empty if they can have none). */
  seats: Lin[][]
  /** Per day, per person: their ügyelet (sums to 0 or 1; empty for nannies). */
  duty: Lin[][]
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

  // ── Ügyelet (v3-b): one group a day, both its teachers on duty, or a hole ─
  const duty = days.map(() => people.map(() => new Lin()))
  for (const day of days) {
    if (day.groups === 0) continue // no teacher at all: no group, no duty
    const d = day.index
    const choice = new Lin().add(milp.binary(v.holeDuty(d)))
    objectives.holes.add(v.holeDuty(d))
    for (const g of groupNumbers(day.groups)) {
      const y = milp.binary(v.dutyGroup(d, g))
      choice.add(y)
      // Each of its two seats hands the duty to whoever holds it: Σ_p z = y with z ≤ x is exact
      // (one holder, or a hole and then no duty), and far tighter for HiGHS than z = x·y.
      for (const t of SHIFTS) {
        const holders = new Lin()
        for (const p of day.present.filter(isTeacher)) {
          const z = milp.nonNegative(v.onDuty(p, d, g, t))
          milp.constrain(new Lin().add(z), '<=', new Lin().add(v.teacherSeat(p, d, g, t)))
          holders.add(z)
          duty[d][p].add(z)
        }
        milp.constrain(holders, '=', new Lin().add(y))
      }
    }
    milp.constrain(choice, '=', 1)
  }

  // Nobody opens, or closes, on every working day of the period.
  if (days.length >= 2) {
    people.forEach((person, p) => {
      if (person.role !== 'nanny' || !days.every((day) => isPresent(p, day))) return
      milp.constrain(Lin.sum(days.map((day) => v.open(p, day.index))), '<=', days.length - 1)
      milp.constrain(Lin.sum(days.map((day) => v.close(p, day.index))), '<=', days.length - 1)
    })
  }

  // ── Fairness (§6.3): |count − share| ≤ gap, rows scaled by `den` ─────────
  const shares = fairShares(input)
  const worst = milp.nonNegative(v.worstGap)
  objectives.worstGap.add(worst)
  const indexOf = new Map(people.map((s, p) => [s.id, p]))
  const dayIndex = new Map(days.map((day) => [day.date, day.index]))
  for (const share of shares) {
    const p = indexOf.get(share.staffId)!
    const ds = share.days.map((date) => dayIndex.get(date)!)
    const count =
      share.kind === 'morning'
        ? Lin.sum(ds.map((d) => v.shift(p, d, 'morning')))
        : share.kind === 'opener'
          ? Lin.sum(ds.map((d) => v.open(p, d)))
          : share.kind === 'closer'
            ? Lin.sum(ds.map((d) => v.close(p, d)))
            : share.kind === 'duty'
              ? ds.reduce((sum, d) => sum.plus(duty[d][p]), new Lin())
              : ds.reduce((reserve, d) => reserve.plus(seats[d][p], -1), Lin.constant(ds.length))
    const gap = milp.nonNegative(v.gap(share.kind, p))
    const scaled = new Lin().add(gap, share.den)
    milp.constrain(scaled, '>=', new Lin().plus(count, share.den).addConstant(-share.num))
    milp.constrain(scaled, '>=', new Lin().plus(count, -share.den).addConstant(share.num))
    // A whole count is never closer to its share than the share is to a whole number.
    const r = share.num % share.den
    if (r !== 0) milp.constrain(scaled, '>=', Math.min(r, share.den - r))
    if (share.kind === 'opener' || share.kind === 'closer') {
      objectives.keysGap.add(gap) // demoted in v3-b: the hours are the same either way
    } else {
      milp.constrain(new Lin().add(worst), '>=', new Lin().add(gap))
      objectives.totalGap.add(gap)
    }
    // The year so far: someone ahead on this count is steered away from more of it (v2).
    const year = input.history?.[share.staffId]?.[share.kind] ?? 0
    if (year !== 0) objectives.yearly.plus(count, year)
  }
  // Without this floor HiGHS can take seconds to prove what counting shows at once.
  const isKey = (s: { kind: GapKind }) => s.kind === 'opener' || s.kind === 'closer'
  const floor = worstGapFloor(shares.filter((s) => !isKey(s)))
  if (floor > 0) milp.constrain(new Lin().add(worst), '>=', floor)
  // The same for the summed gaps; a hair under, so rounding never makes the floor unreachable.
  for (const [stage, kinds] of [
    ['totalGap', shares.filter((s) => !isKey(s))],
    ['keysGap', shares.filter(isKey)],
  ] as const) {
    const total = totalGapFloor(kinds)
    if (total > 0) milp.constrain(new Lin().plus(objectives[stage]), '>=', total - 1e-9)
  }

  // ── Group switches and turnarounds (§6.4) ─────────────────────────────────
  for (let i = 0; i + 1 < days.length; i++) {
    const today = days[i]
    const tomorrow = days[i + 1]
    const nextCalendarDay = addDays(today.date, 1) === tomorrow.date
    for (const p of today.present) {
      if (!isPresent(p, tomorrow)) continue
      if (today.groups > 0 && tomorrow.groups > 0) {
        // switch ≥ inGroup_g(today) + inAnyGroup(tomorrow) − inGroup_g(tomorrow) − 1
        const sw = milp.nonNegative(v.switch(p, today.index))
        objectives.switches.add(sw)
        for (const g of groupNumbers(today.groups)) {
          const moved = new Lin()
            .plus(inGroup(today.index, p, g))
            .plus(seats[tomorrow.index][p])
            .plus(inGroup(tomorrow.index, p, g), -1)
            .addConstant(-1)
          milp.constrain(new Lin().add(sw), '>=', moved)
        }
      }
      if (nextCalendarDay && !isTeacher(p)) {
        // A nanny closing at 18:00 and opening at 6:00 the next day.
        const tu = milp.nonNegative(v.turnaround(p, today.index))
        objectives.turnarounds.add(tu)
        const late = new Lin()
          .add(v.shift(p, today.index, 'afternoon'))
          .add(v.shift(p, tomorrow.index, 'morning'))
          .addConstant(-1)
        milp.constrain(new Lin().add(tu), '>=', late)
      }
    }
  }

  return { milp, objectives, people, days, capacities, seats, duty }
}
