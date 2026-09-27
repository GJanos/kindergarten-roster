import { CALL_IN_ORDER, warningText as t } from '../i18n/hu'
import { dayCapacities, groupsWithoutTeacherHoles } from './capacity'
import { countFor, fairShares } from './fairness'
import { groupSwitches, turnarounds } from './metrics'
import { nameRef } from './names'
import { shiftTimes } from './shifts'
import type { Roster, Severity, SolveInput, Warning, WarningCode } from './types'

const SEVERITY: Record<WarningCode, Severity> = {
  NO_TEACHER: 'red',
  TEACHER_SEAT_EMPTY: 'red',
  OPENER_MISSING: 'red',
  CLOSER_MISSING: 'red',
  GROUPS_REDUCED: 'orange',
  GROUPS_OVERRIDDEN: 'orange',
  SUBSTITUTION: 'orange',
  CLOSED_DAY: 'orange',
  GROUP_SWITCH: 'grey',
  TURNAROUND: 'grey',
  UNEVEN: 'grey',
}
const RANK: Record<Severity, number> = { red: 0, orange: 1, grey: 2 }

/**
 * Flags every relaxation (spec §7), reading only the finished roster and its
 * input — never solver internals — so hand-edited rosters get the same warnings.
 */
export function explain(input: SolveInput, roster: Roster): Warning[] {
  const out: Warning[] = []
  const add = (code: WarningCode, date: string, text: string, rest: Partial<Warning> = {}) =>
    out.push({ code, severity: SEVERITY[code], date, text, cells: [{ date }], ...rest })
  const staff = new Map(input.staff.map((s) => [s.id, s]))
  // References, not names: resolved on display, so a rename reaches saved rosters too.
  const name = nameRef
  const capacities = dayCapacities(input)
  const capacityOf = new Map(capacities.map((c) => [c.date, c]))

  for (const c of capacities) {
    const target = c.override ?? c.requested
    if (c.closed) {
      add('CLOSED_DAY', c.date, t.closedDay(c.date))
      continue
    }
    if (c.gMax === 0) {
      const away = input.absences
        .filter(
          (a) =>
            a.date === c.date &&
            staff.get(a.staffId)?.role === 'teacher' &&
            staff.get(a.staffId)?.active,
        )
        .sort((a, b) => CALL_IN_ORDER[a.kind] - CALL_IN_ORDER[b.kind])
        .map((a) => name(a.staffId))
      add('NO_TEACHER', c.date, t.noTeacher(c.date), { action: t.callIn(away) })
    } else if (c.groups < target) {
      add(
        'GROUPS_REDUCED',
        c.date,
        t.groupsReduced(c.date, c.groups, target, c.teachers, c.nannies),
      )
    }
    if (c.override !== undefined && c.groups === c.override) {
      add('GROUPS_OVERRIDDEN', c.date, t.groupsOverridden(c.date, c.groups))
    }
  }

  for (const hole of roster.holes) {
    const c = capacityOf.get(hole.date)!
    if (hole.kind === 'teacherSeat') {
      const groups = groupsWithoutTeacherHoles(c.teachers, c.nannies, c.groups)
      add(
        'TEACHER_SEAT_EMPTY',
        hole.date,
        t.teacherSeatEmpty(
          hole.date,
          hole.group,
          hole.shift,
          shiftTimes('teacher', hole.shift, hole.date),
        ),
        {
          action: t.teacherSeatAction,
          ...(groups ? { fix: { kind: 'setGroups' as const, date: hole.date, groups } } : {}),
          cells: [{ date: hole.date, group: hole.group }],
        },
      )
    } else {
      add(
        hole.kind === 'opener' ? 'OPENER_MISSING' : 'CLOSER_MISSING',
        hole.date,
        t.keyMissing(hole.date, hole.kind, c.nannies),
        {
          action: hole.kind === 'opener' ? t.openerAction : t.closerAction,
        },
      )
    }
  }

  for (const a of roster.assignments) {
    if (a.substitution && a.seat) {
      add('SUBSTITUTION', a.date, t.substitution(a.date, a.seat.group, name(a.staffId)), {
        cells: [{ staffId: a.staffId, date: a.date, group: a.seat.group }],
      })
    }
  }

  for (const s of groupSwitches(input, roster)) {
    add('GROUP_SWITCH', s.to, t.groupSwitch(name(s.staffId), s.to, s.fromGroup, s.toGroup), {
      cells: [
        { staffId: s.staffId, date: s.from, group: s.fromGroup },
        { staffId: s.staffId, date: s.to, group: s.toGroup },
      ],
    })
  }

  for (const s of turnarounds(input, roster)) {
    add('TURNAROUND', s.late, t.turnaround(name(s.staffId), s.late, s.early), {
      cells: [
        { staffId: s.staffId, date: s.late },
        { staffId: s.staffId, date: s.early },
      ],
    })
  }

  for (const share of fairShares(input)) {
    const count = countFor(share, roster)
    const fair = share.num / share.den
    if (Math.abs(count - fair) < 1 - 1e-9) continue
    const of = share.days.length
    const detail =
      share.kind === 'morning' && count < fair
        ? { kind: 'afternoon' as const, count: of - count, of }
        : { kind: share.kind, count, of }
    // Afternoons are the other side of mornings: a year's +2 mornings is −2 afternoons.
    const year = input.history?.[share.staffId]
    const yearly =
      year === undefined
        ? undefined
        : detail.kind === 'afternoon'
          ? -(year.morning ?? 0)
          : (year[detail.kind] ?? 0)
    add('UNEVEN', share.days[0], t.uneven(name(share.staffId), detail, yearly), {
      cells: share.days.map((date) => ({ staffId: share.staffId, date })),
    })
  }

  // By day, then severity; ties keep the order above.
  return out
    .map((warning, i) => ({ warning, i }))
    .sort((a, b) =>
      a.warning.date !== b.warning.date
        ? a.warning.date.localeCompare(b.warning.date)
        : RANK[a.warning.severity] - RANK[b.warning.severity] || a.i - b.i,
    )
    .map(({ warning }) => warning)
}
