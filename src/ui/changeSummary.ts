import { scheduleChanges, type ScheduleChange } from '../core/recalc'
import type { Roster, Staff } from '../core/types'
import { ui } from '../i18n/hu'
import type { UndoDetail } from '../state/undo'

/**
 * What a recalculation changed, for the undo bar: one line per person with only what changed on
 * each day. People whose hours changed come first — the calls to make, today's at the top; those
 * who only move group or key follow, to be told at the door.
 */
export function changeSummary(
  before: Roster,
  after: Roster,
  from: string,
  staff: Staff[],
  today: string,
): UndoDetail[] {
  const person = new Map(staff.map((s) => [s.id, s]))
  const name = (id: string) => person.get(id)?.displayName ?? '?'
  const byPerson = new Map<string, ScheduleChange[]>()
  const changes = scheduleChanges(before, after, from).sort((a, b) => a.date.localeCompare(b.date))
  for (const c of changes) byPerson.set(c.staffId, [...(byPerson.get(c.staffId) ?? []), c])
  if (byPerson.size === 0) return [{ title: ui.recalc.unchanged, items: [] }]

  const line = (days: ScheduleChange[]) => {
    const role = person.get(days[0].staffId)?.role ?? 'teacher'
    return ui.recalc.person(
      name(days[0].staffId),
      days.map((c) => ui.recalc.day(role, c.before, c.after, c.date === today)),
    )
  }
  // The earliest changed hours order the people to phone; the earliest change orders the rest.
  const firstHours = (days: ScheduleChange[]) => days.find((c) => c.hours)?.date
  const byDateThenName =
    (key: (days: ScheduleChange[]) => string) => (a: ScheduleChange[], b: ScheduleChange[]) =>
      key(a).localeCompare(key(b)) || name(a[0].staffId).localeCompare(name(b[0].staffId), 'hu')
  const people = [...byPerson.values()]
  const call = people.filter((days) => firstHours(days)).sort(byDateThenName((d) => firstHours(d)!))
  const tell = people.filter((days) => !firstHours(days)).sort(byDateThenName((d) => d[0].date))
  return [
    ...(call.length > 0
      ? [{ title: ui.recalc.callTitle(call.length), items: call.map(line) }]
      : []),
    ...(tell.length > 0
      ? [{ title: ui.recalc.tellTitle(tell.length), items: tell.map(line) }]
      : []),
  ]
}
