import { scheduleChanges } from '../core/recalc'
import type { Roster, Staff } from '../core/types'
import { ui } from '../i18n/hu'

/**
 * What a recalculation changed, for the undo bar: how many people, then one line per changed day
 * in date order — today's first, the calls to make now.
 */
export function changeLines(
  before: Roster,
  after: Roster,
  from: string,
  staff: Staff[],
  today: string,
): string[] {
  const person = new Map(staff.map((s) => [s.id, s]))
  const name = (id: string) => person.get(id)?.displayName ?? '?'
  const changes = scheduleChanges(before, after, from).sort(
    (a, b) => a.date.localeCompare(b.date) || name(a.staffId).localeCompare(name(b.staffId), 'hu'),
  )
  const lines = changes.map((c) => {
    const role = person.get(c.staffId)?.role ?? 'teacher'
    return ui.recalc.change(
      name(c.staffId),
      c.date,
      c.date === today,
      ui.recalc.dayText(role, c.after),
      ui.recalc.dayText(role, c.before),
    )
  })
  return [ui.recalc.changedPeople(new Set(changes.map((c) => c.staffId)).size), ...lines]
}
