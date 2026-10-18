import { addDays } from '../../src/core/calendar'
import type { Absence, DayPlan, RosterMeta, SolveInput, Staff } from '../../src/core/types'

/** Builders for tests. Nothing here reaches the app bundle. */

export const TEST_META: RosterMeta = { solvedAt: '2026-10-20T08:00:00.000Z', appVersion: 'test' }

/** Teachers t1…tN, nannies n1…nM, asszisztens a1…, civils c1…, all active; names are the ids in capitals. */
export function makeStaff(teachers: number, nannies: number, assistants = 0, civils = 0): Staff[] {
  const person = (id: string, role: Staff['role']): Staff => ({
    id,
    fullName: id.toUpperCase(),
    displayName: id.toUpperCase(),
    role,
    active: true,
  })
  const some = (count: number, prefix: string, role: Staff['role']) =>
    Array.from({ length: count }, (_, i) => person(`${prefix}${i + 1}`, role))
  return [
    ...some(teachers, 't', 'teacher'),
    ...some(nannies, 'n', 'nanny'),
    ...some(assistants, 'a', 'assistant'),
    ...some(civils, 'c', 'civil'),
  ]
}

export function consecutiveDays(start: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => addDays(start, i))
}

export type InputSpec = {
  teachers: number
  nannies: number
  assistants?: number // pedagógiai asszisztens (v3-c)
  civils?: number
  groups: number
  days?: string[] // default: Monday 2026-10-26 to Friday 2026-10-30
  absent?: Record<string, string[]> // staff id → absent dates
  overrides?: Record<string, number> // date → group count
}

export function makeInput(spec: InputSpec): SolveInput {
  const days = spec.days ?? consecutiveDays('2026-10-26', 5)
  const absences: Absence[] = Object.entries(spec.absent ?? {}).flatMap(([staffId, dates]) =>
    dates.map((date) => ({ staffId, date, kind: 'leave' as const })),
  )
  const dayPlans: DayPlan[] = days.map((date) => {
    const override = spec.overrides?.[date]
    return override === undefined
      ? { date, requestedGroups: spec.groups }
      : { date, requestedGroups: spec.groups, override }
  })
  return {
    staff: makeStaff(spec.teachers, spec.nannies, spec.assistants, spec.civils),
    absences,
    period: { start: days[0], days },
    dayPlans,
  }
}

/** Deterministic pseudo-random numbers in [0, 1) (mulberry32). */
export function seededRandom(seed: number): () => number {
  let state = seed
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** A reproducible random period: 1–6 days, 1–4 groups, random staff, absences and overrides. */
export function randomInput(seed: number): SolveInput {
  const random = seededRandom(seed)
  const int = (lo: number, hi: number) => lo + Math.floor(random() * (hi - lo + 1))
  const days = consecutiveDays('2026-10-26', int(1, 6))
  const groups = int(1, 4)
  const input = makeInput({ teachers: int(2, 10), nannies: int(1, 6), groups, days })
  const absenceRate = random() * 0.3
  input.absences = input.staff.flatMap((s) =>
    days
      .filter(() => random() < absenceRate)
      .map((date) => ({ staffId: s.id, date, kind: 'leave' as const })),
  )
  input.dayPlans = days.map((date) =>
    random() < 0.1
      ? { date, requestedGroups: groups, override: int(0, groups) }
      : { date, requestedGroups: groups },
  )
  return input
}

/** randomInput(seed) plus 0–2 asszisztens and 0–2 civils, from their own stream (v3-c). */
export function randomHelperInput(seed: number): SolveInput {
  const input = randomInput(seed)
  const random = seededRandom(seed + 10_000)
  const int = (lo: number, hi: number) => lo + Math.floor(random() * (hi - lo + 1))
  const helpers = makeStaff(0, 0, int(0, 2), int(0, 2))
  const days = input.period.days
  return {
    ...input,
    staff: [...input.staff, ...helpers],
    absences: [
      ...input.absences,
      ...helpers.flatMap((s) =>
        days
          .filter(() => random() < 0.2)
          .map((date) => ({ staffId: s.id, date, kind: 'leave' as const })),
      ),
    ],
  }
}
