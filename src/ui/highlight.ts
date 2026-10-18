import { isHelper, type Roster, type Staff, type Warning } from '../core/types'
import { hasHelperRow } from '../export/views'

/**
 * The group-view cells a warning points at, as `row|date` keys. Rows are the
 * groups (0-based), then reserve teachers, then reserve nannies, then (v3-c) the helper row.
 */
export function highlightedCells(roster: Roster, staff: Staff[], warning?: Warning): Set<string> {
  const keys = new Set<string>()
  if (!warning) return keys
  const days = roster.period.days
  const groups = Math.max(0, ...days.map((d) => roster.groupsPerDay[d] ?? 0))
  const rows = groups + 2 + (hasHelperRow(roster, staff) ? 1 : 0)
  const role = new Map(staff.map((s) => [s.id, s.role]))
  for (const cell of warning.cells) {
    if (cell.group !== undefined) {
      keys.add(`${cell.group - 1}|${cell.date}`)
    } else if (cell.staffId !== undefined) {
      const a = roster.assignments.find((x) => x.staffId === cell.staffId && x.date === cell.date)
      if (!a) continue
      const r = role.get(a.staffId)
      const row = a.seat
        ? a.seat.group - 1
        : r === 'teacher'
          ? groups
          : r !== undefined && isHelper(r)
            ? groups + 2
            : groups + 1
      keys.add(`${row}|${cell.date}`)
    } else {
      for (let row = 0; row < rows; row++) keys.add(`${row}|${cell.date}`)
    }
  }
  return keys
}
