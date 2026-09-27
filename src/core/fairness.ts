import { dayCapacities } from './capacity'
import type { Assignment, Roster, SolveInput } from './types'

export type GapKind = 'morning' | 'opener' | 'closer' | 'reserve'

/**
 * A fair share (spec §6.3): over `days`, `staffId`'s count of `kind` should be
 * `num / den`. Shares with the same `pool` deal out a fixed whole total.
 */
export type Share = {
  staffId: string
  kind: GapKind
  days: string[]
  num: number
  den: number
  pool?: string
}

/**
 * Every share for a period. Once holes and substitutions are minimal (stages 1–2)
 * each total is fixed by capacity, so the shares are constants.
 */
export function fairShares(input: SolveInput): Share[] {
  const open = dayCapacities(input).filter((c) => !c.closed)
  const absent = new Set(input.absences.map((a) => `${a.staffId}|${a.date}`))
  const people = input.staff.filter((s) => s.active)
  const presentOn = (staffId: string, dates: string[]) =>
    dates.filter((date) => !absent.has(`${staffId}|${date}`))
  const openDays = open.map((c) => c.date)
  const shares: Share[] = []

  // Morning shifts: half of the days worked.
  for (const person of people) {
    const days = presentOn(person.id, openDays)
    if (days.length > 0)
      shares.push({ staffId: person.id, kind: 'morning', days, num: days.length, den: 2 })
  }

  // Reserve days: the role's reserve days, split by share of the role's working days.
  for (const role of ['teacher', 'nanny'] as const) {
    let pool = 0
    for (const c of open) {
      const substitutes = Math.max(0, c.groups - c.nannies)
      pool +=
        role === 'teacher'
          ? Math.max(0, c.teachers - substitutes - 2 * c.groups)
          : Math.max(0, c.nannies - c.groups)
    }
    const members = people
      .filter((s) => s.role === role)
      .map((s) => ({ staffId: s.id, days: presentOn(s.id, openDays) }))
      .filter((m) => m.days.length > 0)
    const roleDays = members.reduce((sum, m) => sum + m.days.length, 0)
    for (const { staffId, days } of members) {
      shares.push({
        staffId,
        kind: 'reserve',
        days,
        num: pool * days.length,
        den: roleDays,
        pool: `reserve:${role}`,
      })
    }
  }

  // Opener and closer days, on days with two or more nannies: a lone nanny's key is forced.
  const keyDays = open.filter((c) => c.nannies >= 2).map((c) => c.date)
  const holders = people
    .filter((s) => s.role === 'nanny')
    .map((s) => ({ staffId: s.id, days: presentOn(s.id, keyDays) }))
    .filter((m) => m.days.length > 0)
  const holderDays = holders.reduce((sum, m) => sum + m.days.length, 0)
  for (const kind of ['opener', 'closer'] as const) {
    for (const { staffId, days } of holders) {
      shares.push({
        staffId,
        kind,
        days,
        num: keyDays.length * days.length,
        den: holderDays,
        pool: kind,
      })
    }
  }
  return shares
}

const counts: Record<GapKind, (a: Assignment) => boolean> = {
  morning: (a) => a.shift === 'morning',
  opener: (a) => a.opener === true,
  closer: (a) => a.closer === true,
  reserve: (a) => a.seat === undefined,
}

export function countFor(share: Share, roster: Roster): number {
  const days = new Set(share.days)
  return roster.assignments.filter(
    (a) => a.staffId === share.staffId && days.has(a.date) && counts[share.kind](a),
  ).length
}

export function gapOf(share: Share, roster: Roster): number {
  return Math.abs(countFor(share, roster) - share.num / share.den)
}

/**
 * Shares `nums[i] / den` add up to a whole total that must be dealt out in whole
 * counts. Returns the smallest possible largest |count − share|: round up the
 * shares with the largest fractions, round the rest down.
 */
export function apportionmentFloor(nums: number[], den: number): number {
  const remainders = nums.map((num) => num % den).sort((a, b) => b - a)
  const roundUp = remainders.reduce((sum, r) => sum + r, 0) / den
  let worst = 0
  remainders.forEach((r, i) => {
    worst = Math.max(worst, i < roundUp ? den - r : r)
  })
  return worst / den
}

/** A lower bound on the worst gap any roster can reach: stage 3 may stop as soon as it gets there. */
export function worstGapFloor(shares: Share[]): number {
  let floor = 0
  const pools = new Map<string, Share[]>()
  for (const share of shares) {
    const r = share.num % share.den
    floor = Math.max(floor, Math.min(r, share.den - r) / share.den)
    if (share.pool) pools.set(share.pool, [...(pools.get(share.pool) ?? []), share])
  }
  for (const members of pools.values()) {
    floor = Math.max(
      floor,
      apportionmentFloor(
        members.map((m) => m.num),
        members[0].den,
      ),
    )
  }
  return floor
}
