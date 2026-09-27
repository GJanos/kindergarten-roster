import { dayCapacities, gMax } from '../core/capacity'
import type { Role, SolveInput, Warning, WarningCode } from '../core/types'
import { capitalize, dayName } from '../i18n/hu'

export type DayFix =
  NonNullable<Warning['fix']> | { kind: 'callIn'; date: string; staffId: string; name: string }

export type WarningDay = {
  date: string
  items: Warning[] // red, then orange
  texts: string[] // the items' texts without the day name the card shows
  holes: number // red items
  actions: string[] // each suggestion once
  fixes: DayFix[] // each one-click fix once
}

/** The day chips above already say these. */
const SHOWN_IN_CHIPS: ReadonlySet<WarningCode> = new Set(['CLOSED_DAY', 'GROUPS_OVERRIDDEN'])

/**
 * One card per day, since every fix works on a day: three empty seats on Monday share one
 * "Hétfőn 2 csoport" button. Grey notes (fairness, switches) go to a separate collapsed list.
 */
export function warningDays(
  warnings: Warning[],
  input: SolveInput,
): { days: WarningDay[]; notes: Warning[] } {
  const notes = warnings.filter((w) => w.severity === 'grey')
  const shown = warnings.filter((w) => w.severity !== 'grey' && !SHOWN_IN_CHIPS.has(w.code))
  const dates = [...new Set(shown.map((w) => w.date))].sort()
  const days = dates.map((date) => {
    const onDay = shown.filter((w) => w.date === date)
    const items = [
      ...onDay.filter((w) => w.severity === 'red'),
      ...onDay.filter((w) => w.severity !== 'red'),
    ]
    const fixes: DayFix[] = []
    for (const w of items) {
      if (w.fix && !fixes.some((f) => f.kind === 'setGroups' && f.groups === w.fix!.groups)) {
        fixes.push(w.fix)
      }
    }
    fixes.push(...callIns(date, items, input))
    return {
      date,
      items,
      texts: items.map((w) => withoutDay(w.text, date)),
      holes: items.filter((w) => w.severity === 'red').length,
      actions: [...new Set(items.flatMap((w) => (w.action ? [w.action] : [])))],
      fixes,
    }
  })
  return { days, notes }
}

/** 'Hétfő, 1. cs.: …' → '1. cs.: …'; other wordings stay as they are. */
function withoutDay(text: string, date: string): string {
  const prefix = capitalize(dayName(date))
  return text.startsWith(`${prefix}, `) || text.startsWith(`${prefix}: `)
    ? text.slice(prefix.length + 2)
    : text
}

/** Absent people whose coming in after all would fix one of the day's problems. */
function callIns(date: string, items: Warning[], input: SolveInput): DayFix[] {
  const c = dayCapacities(input).find((d) => d.date === date)
  if (!c || c.closed) return []
  const codes = new Set(items.map((w) => w.code))
  const reduced = codes.has('GROUPS_REDUCED')
  const helps: Record<Role, boolean> = {
    teacher:
      codes.has('NO_TEACHER') ||
      codes.has('TEACHER_SEAT_EMPTY') ||
      (reduced && gMax(c.teachers + 1, c.nannies) > gMax(c.teachers, c.nannies)),
    nanny:
      codes.has('OPENER_MISSING') ||
      codes.has('CLOSER_MISSING') ||
      codes.has('SUBSTITUTION') ||
      (reduced && gMax(c.teachers, c.nannies + 1) > gMax(c.teachers, c.nannies)),
  }
  const away = new Set(input.absences.filter((a) => a.date === date).map((a) => a.staffId))
  return input.staff
    .filter((s) => s.active && away.has(s.id) && helps[s.role])
    .map((s) => ({ kind: 'callIn', date, staffId: s.id, name: s.displayName }))
}
