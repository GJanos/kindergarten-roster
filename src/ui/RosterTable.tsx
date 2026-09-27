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
  /** Names become click targets for a swap; the picked one is marked. */
  pick?: {
    picked?: { staffId: string; date: string }
    onPick: (staffId: string, date: string) => void
  }
}) {
  const view = groupView(props.roster, props.staff, props.labels)
  const marked = highlightedCells(props.roster, props.staff, props.highlight)
  const cellClass = (key: string) =>
    [marked.has(key) ? 'highlight' : '', props.changed?.has(key) ? 'changed' : '']
      .filter(Boolean)
      .join(' ') || undefined
  return (
    <table className={props.pick ? 'roster-table editable' : 'roster-table'}>
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
                {lines.map((line, j) => {
                  const date = view.days[i]
                  const { pick } = props
                  const target = pick && line.staffId ? line.staffId : undefined
                  const picked =
                    target !== undefined &&
                    pick?.picked?.staffId === target &&
                    pick.picked.date === date
                  return (
                    <div
                      key={j}
                      className={
                        [lineClass(line), picked ? 'picked' : ''].filter(Boolean).join(' ') ||
                        undefined
                      }
                      data-staff={target}
                      onClick={target ? () => pick!.onPick(target, date) : undefined}
                    >
                      {line.text}
                    </div>
                  )
                })}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
