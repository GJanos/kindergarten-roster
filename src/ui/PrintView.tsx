import type { Absence, Roster, Staff } from '../core/types'
import { footnotes, groupView, personView } from '../export/views'
import { LEGEND, dayHeader, formatPeriod, ui } from '../i18n/hu'
import { lineClass } from './RosterTable'

type Props = { roster: Roster; staff: Staff[]; absences: Absence[]; labels?: string[] }

/** Two A4 landscape pages, shown only when printing (see print.css). */
export function PrintView({ roster, staff, absences, labels }: Props) {
  const groups = groupView(roster, staff, labels)
  const people = personView(roster, staff, absences)
  const period = formatPeriod(roster.period.days)
  const notes = footnotes(roster, staff)
  const header = (
    <tr>
      <th />
      {roster.period.days.map((date) => (
        <th key={date}>{dayHeader(date)}</th>
      ))}
    </tr>
  )
  const legend = (
    <div className="legend">
      {LEGEND.map((line) => (
        <div key={line}>{line}</div>
      ))}
    </div>
  )

  return (
    <div className="print-only">
      <section className="page">
        <h1>{ui.print.groupTitle(period)}</h1>
        <table>
          <thead>{header}</thead>
          <tbody>
            {groups.rows.map((row) => (
              <tr key={row.label}>
                <th>{row.label}</th>
                {row.cells.map((lines, i) => (
                  <td key={groups.days[i]}>
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
        {notes.length > 0 && (
          <div className="footnotes">
            {notes.map((note) => (
              <div key={note}>{note}</div>
            ))}
          </div>
        )}
        {legend}
      </section>
      <section className="page">
        <h1>{ui.print.personTitle(period)}</h1>
        <table>
          <thead>{header}</thead>
          <tbody>
            {people.rows.map((row) => (
              <tr key={row.staffId}>
                <th>{row.name}</th>
                {row.cells.map((cell, i) => (
                  <td
                    key={people.days[i]}
                    className={
                      [cell.fill ? `fill-${cell.fill}` : '', lineClass(cell) ?? '']
                        .join(' ')
                        .trim() || undefined
                    }
                  >
                    {cell.text}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {legend}
      </section>
    </div>
  )
}
