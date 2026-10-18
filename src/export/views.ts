import {
  isHelper,
  ROLES,
  SHIFTS,
  type Absence,
  type Assignment,
  type Role,
  type Roster,
  type Shift,
  type Staff,
} from '../core/types'
import { resolveNames, rosterOrder } from '../core/names'
import {
  ABSENCE_WORD,
  DUTY,
  HOLE,
  dutyMark,
  groupName,
  groupShort,
  helperShort,
  shiftShort,
} from '../i18n/hu'

/** The printout's two tables as plain data, shared by print and Excel. */

export type Tone = 'hole' | 'substitution' | 'muted' | 'duty'
export type Line = { text: string; bold?: boolean; tone?: Tone; staffId?: string }
export type GroupView = { days: string[]; rows: { label: string; cells: Line[][] }[] }

export type Fill = Shift | 'absent' | 'closed'
export type PersonCell = { text: string; fill?: Fill; bold?: boolean; tone?: Tone }
export type PersonView = {
  days: string[]
  rows: { staffId: string; name: string; role: Role; cells: PersonCell[] }[]
}

function names(staff: Staff[]): (id: string) => string {
  const byId = new Map(staff.map((s) => [s.id, s.displayName]))
  return (id) => byId.get(id) ?? '?'
}

function key(a: Assignment): string {
  return a.opener ? ', nyit' : a.closer ? ', zár' : ''
}

/** Openers and closers print bold. */
function bold(a: Assignment): { bold?: true } {
  return a.opener || a.closer ? { bold: true } : {}
}

const byShiftThenName =
  (name: (id: string) => string) =>
  (a: Assignment, b: Assignment): number =>
    a.shift === b.shift
      ? name(a.staffId).localeCompare(name(b.staffId), 'hu')
      : a.shift === 'morning'
        ? -1
        : 1

/** The day's ügyelet group cell: it opens with the Ügyelet line (v3-b). */
export function isDutyCell(lines: Line[]): boolean {
  return lines.some((line) => line.tone === 'duty')
}

/** The row for helpers out of every seat (v3-c): asszisztens extras and civils. */
export const HELPER_ROW = 'Asszisztens, civil'
const HELPER_WORD: Partial<Record<Role, string>> = { assistant: 'Asszisztens', civil: 'Civil' }

/** A week with a helper gets the helper row, so the group view has one more row. */
export function hasHelperRow(roster: Roster, staff: Staff[]): boolean {
  const role = new Map(staff.map((s) => [s.id, s.role]))
  return roster.assignments.some((a) => {
    const r = role.get(a.staffId)
    return r !== undefined && isHelper(r)
  })
}

/**
 * Rows: each group, then the reserve teachers and nannies, then (v3-c) the helpers out of every
 * seat; columns: the days.
 */
export function groupView(roster: Roster, staff: Staff[], groupLabels: string[] = []): GroupView {
  const name = names(staff)
  const role = new Map(staff.map((s) => [s.id, s.role]))
  const days = roster.period.days
  const on = (date: string) => roster.assignments.filter((a) => a.date === date)
  const maxGroups = Math.max(0, ...days.map((date) => roster.groupsPerDay[date] ?? 0))
  const rows: GroupView['rows'] = []

  for (let g = 1; g <= maxGroups; g++) {
    const label = groupLabels[g - 1] ? `${groupName(g)} – ${groupLabels[g - 1]}` : groupName(g)
    const cells = days.map((date): Line[] => {
      const today = on(date)
      if (today.length === 0) return [{ text: 'zárva', tone: 'muted' }]
      if (g > roster.groupsPerDay[date]) {
        return [{ text: roster.groupsPerDay[date] > 0 ? 'összevonva' : '—', tone: 'muted' }]
      }
      const lines: Line[] = SHIFTS.map((shift): Line => {
        const a = today.find(
          (x) => x.seat?.kind === 'teacher' && x.seat.group === g && x.seat.shift === shift,
        )
        if (!a) return { text: `${shiftShort[shift]}: ${HOLE}`, tone: 'hole' }
        if (a.substitution) {
          // An asszisztens's hours don't move on ügyelet: no mark (v3-c).
          return {
            text: `${shiftShort[shift]}: ${name(a.staffId)} (asszisztens, ${helperShort[a.shift]})`,
            tone: 'substitution',
            staffId: a.staffId,
          }
        }
        return {
          text: `${shiftShort[shift]}: ${name(a.staffId)}${a.duty ? dutyMark[shift] : ''}`,
          staffId: a.staffId,
        }
      })
      if (today.some((x) => x.duty && x.seat?.kind === 'teacher' && x.seat.group === g)) {
        lines.unshift({ text: DUTY, bold: true, tone: 'duty' })
      }
      const beside = today.find((x) => x.seat?.kind === 'helper' && x.seat.group === g)
      if (beside) {
        lines.push({
          text: `Asszisztens: ${name(beside.staffId)} (${helperShort[beside.shift]})`,
          staffId: beside.staffId,
        })
      }
      const nanny = today.find((x) => x.seat?.kind === 'nanny' && x.seat.group === g)
      if (nanny?.substitution) {
        const civil = role.get(nanny.staffId) === 'civil'
        lines.push({
          text: civil
            ? `Dajka: ${name(nanny.staffId)} (civil, ${shiftShort[nanny.shift]}${key(nanny)})`
            : `Dajka: ${name(nanny.staffId)} (óvónő, ${shiftShort[nanny.shift]})`,
          tone: 'substitution',
          ...(civil ? bold(nanny) : {}),
          staffId: nanny.staffId,
        })
      } else if (nanny) {
        lines.push({
          text: `Dajka: ${name(nanny.staffId)} (${shiftShort[nanny.shift]}${key(nanny)})`,
          ...bold(nanny),
          staffId: nanny.staffId,
        })
      }
      return lines
    })
    rows.push({ label, cells })
  }

  for (const [label, wanted] of [
    ['Csoporton kívül – óvónő', 'teacher'],
    ['Csoporton kívül – dajka', 'nanny'],
  ] as const) {
    const cells = days.map((date) =>
      on(date)
        .filter((a) => !a.seat && role.get(a.staffId) === wanted)
        .sort(byShiftThenName(name))
        .map((a) => ({
          text: `${name(a.staffId)} (${shiftShort[a.shift]}${key(a)})`,
          ...bold(a),
          staffId: a.staffId,
        })),
    )
    rows.push({ label, cells })
  }
  if (hasHelperRow(roster, staff)) {
    const order = (a: Assignment) => ROLES.indexOf(role.get(a.staffId) ?? 'teacher')
    rows.push({
      label: HELPER_ROW,
      cells: days.map((date) =>
        on(date)
          .filter((a) => !a.seat && isHelper(role.get(a.staffId) ?? 'teacher'))
          .sort(
            (a, b) => order(a) - order(b) || name(a.staffId).localeCompare(name(b.staffId), 'hu'),
          )
          .map((a) => ({
            text: `${HELPER_WORD[role.get(a.staffId)!]}: ${name(a.staffId)} (${helperShort[a.shift]})`,
            staffId: a.staffId,
          })),
      ),
    })
  }
  return { days, rows }
}

/** Red and orange warnings print as footnotes; grey ones stay on screen (spec §7). */
export function footnotes(roster: Roster, staff: Staff[]): string[] {
  return roster.warnings
    .filter((w) => w.severity !== 'grey')
    .map((w) => resolveNames(`* ${w.text}${w.action ? ` ${w.action}` : ''}`, staff))
}

/** One row per person, in `ROLES` order: 'DE · 1. cs.', 'DU · tartalék', 'távol'. */
export function personView(roster: Roster, staff: Staff[], absences: Absence[]): PersonView {
  const days = roster.period.days
  const absent = new Map(absences.map((a) => [`${a.staffId}|${a.date}`, a.kind]))
  const at = new Map(roster.assignments.map((a) => [`${a.staffId}|${a.date}`, a]))
  const openDays = new Set(roster.assignments.map((a) => a.date))
  const inRoster = new Set(roster.assignments.map((a) => a.staffId))
  const people = rosterOrder(
    staff.filter(
      (s) => inRoster.has(s.id) || (s.active && days.some((d) => absent.has(`${s.id}|${d}`))),
    ),
  )

  const cellFor = (s: Staff, date: string): PersonCell => {
    const a = at.get(`${s.id}|${date}`)
    if (a) {
      const where = a.seat ? groupShort(a.seat.group) : s.role === 'civil' ? 'civil' : 'tartalék'
      const extra = a.substitution
        ? a.seat?.kind === 'teacher'
          ? ' (óvónő helyett)'
          : ' (dajka helyett)'
        : a.opener
          ? ' · nyit'
          : a.closer
            ? ' · zár'
            : ''
      return {
        text: `${shiftShort[a.shift]} · ${where}${extra}${a.duty ? ' · ügyelet' : ''}`,
        fill: a.shift,
        ...bold(a),
        ...(a.substitution ? { tone: 'substitution' as const } : {}),
      }
    }
    if (!openDays.has(date)) return { text: 'zárva', fill: 'closed' }
    const kind = absent.get(`${s.id}|${date}`)
    if (kind) return { text: ABSENCE_WORD[kind], fill: 'absent' }
    return { text: '' }
  }

  return {
    days,
    rows: people.map((s) => ({
      staffId: s.id,
      name: s.displayName,
      role: s.role,
      cells: days.map((date) => cellFor(s, date)),
    })),
  }
}
