import type { Absence, Staff } from '../core/types'
import { compactDates, ui } from '../i18n/hu'
import { monthReport, type MonthReportRow } from '../state/monthReport'
import { today } from './dates'

type Props = { absences: Absence[]; staff: Staff[]; month: string }

function ReportTable({ rows }: { rows: MonthReportRow[] }) {
  return (
    <table className="month-report-table">
      <thead>
        <tr>
          {ui.absences.report.columns.map((column) => (
            <th key={column}>{column}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.staffId}>
            <th scope="row">{row.name}</th>
            <td>{row.counts.leave}</td>
            <td>{row.counts.sick}</td>
            <td>{row.counts.other}</td>
            <td>{row.total}</td>
            <td className="dates">{compactDates(row.dates)}</td>
            <td>{row.leaveLeft ?? ''}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** On screen, in place of the grid. */
export function MonthReportPanel({ onClose, ...props }: Props & { onClose: () => void }) {
  const title = ui.absences.report.title(props.month)
  return (
    <section className="month-report" aria-label={title}>
      <h3>{title}</h3>
      <ReportTable rows={monthReport(props.absences, props.staff, props.month)} />
      <div className="month-report-actions">
        <button className="primary" onClick={() => window.print()}>
          {ui.absences.report.print}
        </button>
        <button onClick={onClose}>{ui.absences.report.close}</button>
      </div>
    </section>
  )
}

/** One A4 portrait page, shown only when printing (see print.css). */
export function MonthReportPrint({ absences, staff, month }: Props) {
  return (
    <div className="print-only month-report-print">
      <h1>{ui.absences.report.title(month)}</h1>
      <ReportTable rows={monthReport(absences, staff, month)} />
      <p className="footnotes">{ui.absences.report.made(today())}</p>
    </div>
  )
}
