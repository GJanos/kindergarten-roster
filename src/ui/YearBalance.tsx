import { ui } from '../i18n/hu'
import type { AppState } from '../state/appState'
import { yearStart, yearTotals } from '../state/history'
import { Info } from './Info'

/** '+0,5', '−1', or nothing when it rounds to zero. */
function signed(delta: number | undefined): string {
  if (delta === undefined || Math.abs(delta) < 0.05) return ''
  const size = String(Math.round(Math.abs(delta) * 10) / 10).replace('.', ',')
  return ` (${delta > 0 ? '+' : '−'}${size})`
}

/**
 * The kindergarten year per person, folded away at the bottom of the Munkatársak tab. Shown from
 * the first staff member on, with zeros and a note until a roster is saved.
 */
export function YearBalance({ state, today }: { state: AppState; today: string }) {
  const rows = yearTotals(state, today)
  if (rows.length === 0) return null
  const name = (id: string) => state.staff.find((s) => s.id === id)?.displayName ?? '?'
  const year = Number(yearStart(today).slice(0, 4))
  const empty = rows.every(({ counts }) => Object.values(counts).every((n) => n === 0))
  return (
    <details className="tips year-balance">
      <summary>
        {ui.staff.yearBalance(year)} <Info text={ui.staff.yearBalanceHint} />
      </summary>
      {empty && <p className="hint">{ui.staff.yearBalanceEmpty}</p>}
      <table className="staff">
        <thead>
          <tr>
            {ui.staff.yearColumns.map((column) => (
              <th key={column}>{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ staffId, counts, deltas }) => (
            <tr key={staffId}>
              <td>{name(staffId)}</td>
              <td>{`${counts.morning}${signed(deltas.morning)}`}</td>
              <td>{`${counts.afternoon}${signed(deltas.morning === undefined ? undefined : -deltas.morning)}`}</td>
              <td>{`${counts.opener}${signed(deltas.opener)}`}</td>
              <td>{`${counts.closer}${signed(deltas.closer)}`}</td>
              <td>{`${counts.reserve}${signed(deltas.reserve)}`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  )
}
