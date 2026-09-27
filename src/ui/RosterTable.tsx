import type { Roster, Staff, Warning } from '../core/types'
import { groupView, type Line } from '../export/views'
import { dayHeader, ui } from '../i18n/hu'
import { Info } from './Info'
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
  changed?: Set<string> // cells the last change altered, as row|date keys
}) {
  const view = groupView(props.roster, props.staff, props.labels)
  const marked = highlightedCells(props.roster, props.staff, props.highlight)
  const cellClass = (key: string) =>
    [marked.has(key) ? 'highlight' : '', props.changed?.has(key) ? 'changed' : '']
      .filter(Boolean)
      .join(' ') || undefined
  return (
    <table className="roster-table">
      <thead>
        <tr>
          <th>
            <Info text={ui.roster.tableHint} />
          </th>
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
              <td key={view.days[i]} className={cellClass(`${r}|${view.days[i]}`)}>
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
