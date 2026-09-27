import type { Roster, Staff, Warning } from '../core/types'
import { groupView, type Line } from '../export/views'
import { dayHeader } from '../i18n/hu'
import { highlightedCells } from './highlight'

export function lineClass(line: Line): string | undefined {
  return [line.bold ? 'bold' : '', line.tone ?? ''].filter(Boolean).join(' ') || undefined
}

/** The group view on screen — the same table as the printout's first page. */
export function RosterTable(props: {
  roster: Roster
  staff: Staff[]
  labels?: string[]
  highlight?: Warning
}) {
  const view = groupView(props.roster, props.staff, props.labels)
  const marked = highlightedCells(props.roster, props.staff, props.highlight)
  return (
    <table className="roster-table">
      <thead>
        <tr>
          <th />
          {view.days.map((date) => (
            <th key={date}>{dayHeader(date)}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {view.rows.map((row, r) => (
          <tr key={row.label}>
            <th>{row.label}</th>
            {row.cells.map((lines, i) => (
              <td
                key={view.days[i]}
                className={marked.has(`${r}|${view.days[i]}`) ? 'highlight' : undefined}
              >
                {lines.map((line, j) => (
                  <div key={j} className={lineClass(line)}>
                    {line.text}
                  </div>
                ))}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
