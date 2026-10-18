import { addDays } from './calendar'
import { dayCapacities, seatedTeachers, type DayCapacity } from './capacity'
import { fairShares, totalGapFloor, worstGapFloor, type GapKind } from './fairness'
import { Lin, Milp } from './lp'
import {
  HELPER_SHIFTS,
  SHIFTS,
  isHelper,
  type Role,
  type Shift,
  type SolveInput,
  type Staff,
} from './types'

/**
 * Solve stages in strict priority order (spec §6.5, reordered in v3-b). The keep* stages only
 * count in a recalculation of a week in progress (v2-F); 'yearly' is the v2 tie-break. Her v3-b
 * rules: nanny pairs before fairness, the daily DE/DU balance after it, the keys last. 'helpers'
 * (v3-c) seats an asszisztens beside a group once the keep* stages are done.
 */
export const STAGES = [
  'holes',
  'substitutions',
  'keepPeople',
  'keepHours',
  'keepDuties',
  'helpers',
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
  'helpers',
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
  helperSeat: (p: number, d: number, g: number) => `h_${p}_${d}_${g}`,
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
  seatMorning: (p: number, d: number, g: number) => `nm_${p}_${d}_${g}`,
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
  /** Per day, per person: a teacher's ügyelet (sums to 0 or 1; empty for everyone else). */
  duty: Lin[][]
}

export function groupNumbers(groups: number): number[] {
  return Array.from({ length: groups }, (_, i) => i + 1)
}

/**
 * The MILP for `input`. Days before `keepBefore` (a recalculation's kept past) are pinned by
 * `anchorModel` to what was worked: they get every seat a hand edit can make, ungated, and no
 * 8–16 rule (v3-c).
 */
export function buildModel(input: SolveInput, keepBefore?: string): RosterModel {
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
  const capacityOf = new Map(capacities.map((c) => [c.date, c]))

  const milp = new Milp()
  const objectives = Object.fromEntries(STAGES.map((stage) => [stage, new Lin()])) as Record<
    Stage,
    Lin
  >
  const roleOf = (p: number): Role => people[p].role
  const isTeacher = (p: number) => roleOf(p) === 'teacher'
  const isPresent = (p: number, day: ModelDay) => day.present.includes(p)

  // Seat variables per day and person: all of them, and per group.
  const seats = days.map(() => people.map(() => new Lin()))
  // Per day and group: the people who can take its nanny seat, with their seat variable (v3-b).
  const nannySeatVars = days.map(() => new Map<number, [number, string][]>())
  const nannySeatHolder = (d: number, g: number, p: number, name: string) => {
    const list = nannySeatVars[d].get(g) ?? []
    list.push([p, name])
    nannySeatVars[d].set(g, list)
  }
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

  // Per day, per person: the key variables of those who can hold one (nannies; civils standing in).
  const keys = days.map(() => new Map<number, { open: string; close: string }>())
  // Per day: the asszisztens who may take a DU teacher seat (v3-c).
  const standInAssistantsOn: number[][] = days.map(() => [])

  // ── Strict rules (§6.2) ───────────────────────────────────────────────────
  for (const day of days) {
    const d = day.index
    const groups = groupNumbers(day.groups)
    const pinned = keepBefore !== undefined && day.date < keepBefore
    const withRole = (role: Role) => day.present.filter((p) => roleOf(p) === role)
    const teachers = withRole('teacher')
    const nannies = withRole('nanny')
    const assistants = withRole('assistant')
    // A stand-in only ever fills a seat its own role can't (v3-c): a civil, then a teacher, a
    // nanny seat; an asszisztens a DU teacher seat. A kept day had whatever was worked.
    const shortOfNannies = pinned || nannies.length < day.groups
    const substitutes = shortOfNannies ? teachers : []
    const civilStandIns = shortOfNannies ? withRole('civil') : []
    const seated = seatedTeachers(capacityOf.get(day.date)!)
    const standInAssistants = pinned || seated < 2 * day.groups ? assistants : []
    standInAssistantsOn[d] = standInAssistants

    for (const p of day.present) {
      const own = isHelper(roleOf(p)) ? HELPER_SHIFTS : SHIFTS
      const shifts = Lin.sum(own.map((t) => milp.binary(v.shift(p, d, t))))
      milp.constrain(shifts, '=', 1) // present ⇒ exactly one shift
    }
    for (const p of teachers) {
      for (const t of SHIFTS) {
        const onShift = Lin.sum(groups.map((g) => seat(v.teacherSeat(p, d, g, t), d, p, g)))
        milp.constrain(onShift, '<=', new Lin().add(v.shift(p, d, t))) // teacher seat only on own shift
      }
    }
    // Each helper's stand-in seats (v3-c); without one, 8–16.
    const standIn = new Map<number, Lin>()
    for (const p of standInAssistants) {
      const held = Lin.sum(groups.map((g) => seat(v.teacherSeat(p, d, g, 'afternoon'), d, p, g)))
      milp.constrain(held, '<=', new Lin().add(v.shift(p, d, 'afternoon'))) // 10–18 covers the DU seat
      objectives.substitutions.plus(held)
      standIn.set(p, held)
    }
    for (const p of assistants) {
      for (const g of groups) seat(v.helperSeat(p, d, g), d, p, g)
    }
    for (const p of substitutes) {
      for (const g of groups) {
        const name = seat(v.substitution(p, d, g), d, p, g)
        objectives.substitutions.add(name, 3) // a teacher as nanny is the last resort (v3-c)
        nannySeatHolder(d, g, p, name)
      }
    }
    for (const p of civilStandIns) {
      const held = new Lin()
      for (const g of groups) {
        const name = seat(v.substitution(p, d, g), d, p, g)
        objectives.substitutions.add(name)
        nannySeatHolder(d, g, p, name)
        held.add(name)
      }
      milp.constrain(held, '<=', Lin.sum(SHIFTS.map((t) => v.shift(p, d, t)))) // a nanny's hours
      standIn.set(p, held)
    }
    if (!pinned) {
      for (const p of day.present.filter((q) => isHelper(roleOf(q)))) {
        // 8–16 unless standing in: the solver moves a helper only to fill a seat.
        const moved = Lin.sum(SHIFTS.map((t) => v.shift(p, d, t)))
        milp.constrain(moved, '<=', standIn.get(p) ?? 0)
      }
      for (const p of assistants) {
        // An asszisztens on 8–16 out of every group costs 1 (the 'helpers' stage).
        objectives.helpers.add(v.shift(p, d, 'day'))
        for (const g of groups) objectives.helpers.add(v.helperSeat(p, d, g), -1)
      }
    }
    const keyHolders = [...nannies, ...civilStandIns]
    for (const p of nannies) {
      for (const g of groups) nannySeatHolder(d, g, p, seat(v.nannySeat(p, d, g), d, p, g))
    }
    for (const p of keyHolders) {
      const open = milp.binary(v.open(p, d))
      const close = milp.binary(v.close(p, d))
      milp.constrain(new Lin().add(open), '<=', new Lin().add(v.shift(p, d, 'morning')))
      milp.constrain(new Lin().add(close), '<=', new Lin().add(v.shift(p, d, 'afternoon')))
      keys[d].set(p, { open, close })
    }
    for (const p of civilStandIns) {
      // A civil holds a key only as a stand-in nanny.
      const { open, close } = keys[d].get(p)!
      milp.constrain(new Lin().add(open).add(close), '<=', standIn.get(p)!)
    }
    for (const p of day.present) {
      if (!seats[d][p].isEmpty()) milp.constrain(seats[d][p], '<=', 1) // at most one seat a day
    }

    for (const g of groups) {
      for (const t of SHIFTS) {
        const hole = milp.binary(v.holeTeacher(d, g, t))
        objectives.holes.add(hole)
        const holders = t === 'afternoon' ? [...teachers, ...standInAssistants] : teachers
        const filled = Lin.sum(holders.map((p) => v.teacherSeat(p, d, g, t))).add(hole)
        milp.constrain(filled, '=', 1) // each teacher seat: a person or a hole
      }
      const bothEmpty = Lin.sum(SHIFTS.map((t) => v.holeTeacher(d, g, t)))
      milp.constrain(bothEmpty, '<=', 1) // group minimum: ≥ 1 teacher
      const noDe = v.holeTeacher(d, g, 'morning')
      if (standInAssistants.length > 0) {
        // Her DU stand-in leaves the group a real teacher: its DE seat is filled.
        const du = Lin.sum(standInAssistants.map((p) => v.teacherSeat(p, d, g, 'afternoon')))
        milp.constrain(du.add(noDe), '<=', 1)
      }
      if (assistants.length > 0) {
        // At most one asszisztens beside a group, and only beside its DE teacher.
        const beside = Lin.sum(assistants.map((p) => v.helperSeat(p, d, g)))
        milp.constrain(beside.add(noDe), '<=', 1)
      }
      const nannySeat = Lin.sum([
        ...nannies.map((p) => v.nannySeat(p, d, g)),
        ...substitutes.map((p) => v.substitution(p, d, g)),
        ...civilStandIns.map((p) => v.substitution(p, d, g)),
      ])
      milp.constrain(nannySeat, '=', 1) // nanny seat always filled
    }

    const holeOpen = milp.binary(v.holeOpen(d))
    const holeClose = milp.binary(v.holeClose(d))
    objectives.holes.add(holeOpen).add(holeClose)
    milp.constrain(Lin.sum(keyHolders.map((p) => v.open(p, d))).add(holeOpen), '=', 1)
    milp.constrain(Lin.sum(keyHolders.map((p) => v.close(p, d))).add(holeClose), '=', 1)
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
        const teachers = day.present.filter(isTeacher)
        const seated = t === 'afternoon' ? [...teachers, ...standInAssistantsOn[d]] : teachers
        for (const p of seated) {
          const z = milp.nonNegative(v.onDuty(p, d, g, t))
          milp.constrain(new Lin().add(z), '<=', new Lin().add(v.teacherSeat(p, d, g, t)))
          holders.add(z)
          // An asszisztens's 10–18 already covers 17:30: no hours move, no fairness count (v3-c).
          if (isTeacher(p)) duty[d][p].add(z)
        }
        milp.constrain(holders, '=', new Lin().add(y))
      }
    }
    milp.constrain(choice, '=', 1)
  }

  // ── Her v3-b soft rules ───────────────────────────────────────────────────
  for (const day of days) {
    const d = day.index

    // Groups 1–2, 3–4…: one nanny DE, the other DU. m_g is 1 when g's nanny seat holder works
    // DE (m = seat·morning, exact); the seat is always filled, so 1 − m_g is its DU. A one-sided
    // bound here instead left HiGHS's relaxation free and made switches time out (2026-10-18).
    const morningIn = (g: number) => {
      const m = new Lin()
      for (const [p, seatVar] of nannySeatVars[d].get(g) ?? []) {
        const w = milp.nonNegative(v.seatMorning(p, d, g))
        const morning = v.shift(p, d, 'morning')
        milp.constrain(new Lin().add(w), '<=', new Lin().add(seatVar))
        milp.constrain(new Lin().add(w), '<=', new Lin().add(morning))
        milp.constrain(new Lin().add(w), '>=', new Lin().add(seatVar).add(morning).addConstant(-1))
        m.add(w)
      }
      return m
    }
    for (let g = 1; g + 1 <= day.groups; g += 2) {
      const clash = milp.nonNegative(v.pairClash(d, g))
      objectives.pairs.add(clash)
      const both = new Lin().plus(morningIn(g)).plus(morningIn(g + 1))
      milp.constrain(new Lin().add(clash), '>=', new Lin().plus(both).addConstant(-1)) // both DE
      milp.constrain(new Lin().add(clash), '>=', Lin.constant(1).plus(both, -1)) // both DU
    }

    // DE − DU per role, reserves included: a gap of 2 costs 1, 3 costs 4, 4 costs 7.
    for (const role of ['teacher', 'nanny'] as const) {
      const members = day.present.filter((p) => people[p].role === role)
      if (members.length < 2) continue
      const diff = new Lin()
      for (const p of members) {
        diff.add(v.shift(p, d, 'morning')).add(v.shift(p, d, 'afternoon'), -1)
      }
      for (const step of [1, 2] as const) {
        const over = milp.nonNegative(v.imbalance(d, role, step))
        objectives.balance.add(over, step)
        milp.constrain(new Lin().add(over), '>=', new Lin().plus(diff).addConstant(-step))
        milp.constrain(new Lin().add(over), '>=', new Lin().plus(diff, -1).addConstant(-step))
      }
    }

    // An opener or closer from reserve costs a little: a seated nanny should hold the key.
    for (const p of day.present.filter((q) => roleOf(q) === 'nanny')) {
      for (const key of ['open', 'close'] as const) {
        const spare = milp.nonNegative(v.keyFromReserve(key, p, d))
        objectives.keysSeated.add(spare)
        const holds = key === 'open' ? v.open(p, d) : v.close(p, d)
        milp.constrain(new Lin().add(spare), '>=', new Lin().add(holds).plus(seats[d][p], -1))
      }
    }
  }

  // Nobody opens, or closes, on every working day of the period: nannies, and civils standing in.
  if (days.length >= 2) {
    people.forEach((_, p) => {
      const held = days.map((day) => keys[day.index].get(p))
      if (held.some((k) => k === undefined)) return
      milp.constrain(Lin.sum(held.map((k) => k!.open)), '<=', days.length - 1)
      milp.constrain(Lin.sum(held.map((k) => k!.close)), '<=', days.length - 1)
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
      if (nextCalendarDay && roleOf(p) === 'nanny') {
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
