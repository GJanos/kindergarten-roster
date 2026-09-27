import type { Roster, Staff } from '../core/types'
import { groupView, type Line } from '../export/views'

const text = (lines: Line[]) => lines.map((line) => line.text).join('\n')

/**
 * The group-view cells of `after` whose content differs from `before`, as `row|date` keys
 * (the same keys as `highlightedCells`). Rows are matched by name, since a new group pushes
 * the reserve rows down.
 */
export function changedCells(
  before: Roster | undefined,
  after: Roster,
  staff: Staff[],
  labels?: string[],
): Set<string> {
  const keys = new Set<string>()
  if (!before) return keys
  const prev = groupView(before, staff, labels)
  const next = groupView(after, staff, labels)
  const prevRows = new Map(prev.rows.map((row) => [row.label, row]))
  next.rows.forEach((row, r) => {
    const old = prevRows.get(row.label)
    row.cells.forEach((lines, i) => {
      const date = next.days[i]
      const j = prev.days.indexOf(date)
      const was = old && j >= 0 ? text(old.cells[j]) : ''
      if (text(lines) !== was) keys.add(`${r}|${date}`)
    })
  })
  return keys
}
