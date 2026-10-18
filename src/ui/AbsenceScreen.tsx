import { useState } from 'react'
import { addDays, mondayOf, periodForWeek } from '../core/calendar'
import { rosterOrder } from '../core/names'
import type { AbsenceKind } from '../core/types'
import { formatPeriod, monthLabel, ui } from '../i18n/hu'
import type { Action, AppState } from '../state/appState'
import { AbsenceGrid } from './AbsenceGrid'
import { MonthReportPanel, MonthReportPrint } from './MonthReport'
import { monthDays, shiftMonth, today } from './dates'

export type AbsenceView = 'month' | 'week'

type Props = {
  state: AppState
  dispatch: (action: Action) => void
  week: string // shared with Beosztás
  onWeek: (week: string) => void
  view: AbsenceView
  onView: (view: AbsenceView) => void
}

const KINDS: readonly AbsenceKind[] = ['leave', 'sick', 'other']

/** Back to the current week or month. Kept in place, only hidden, so the bar never shifts. */
function TodayButton({ away, onClick }: { away: boolean; onClick: () => void }) {
  return (
    <button
      className={away ? undefined : 'invisible'}
      aria-hidden={!away}
      tabIndex={away ? undefined : -1}
      onClick={onClick}
    >
      {ui.absences.today}
    </button>
  )
}

export function AbsenceScreen({ state, dispatch, week, onWeek, view, onView }: Props) {
  const [month, setMonth] = useState(() => today().slice(0, 7))
  const [brush, setBrush] = useState<AbsenceKind>('leave')
  const [report, setReport] = useState(false)
  // A month change closes the report, so it never shows a month she didn't open it for.
  const goMonth = (next: string) => {
    setMonth(next)
    setReport(false)
  }

  const people = rosterOrder(state.staff.filter((s) => s.active))
  if (people.length === 0) return <p>{ui.absences.noStaff}</p>
  const now = today()
  const weekDays = periodForWeek(week).days
  // A week with no working day (all holidays) has nothing to paint; the month view still shows it.
  const byWeek = view === 'week' && weekDays.length > 0
  const showReport = view === 'month' && report

  return (
    <>
      <section className={showReport ? 'absence-screen screen-only' : 'absence-screen'}>
        <div className="bar">
          <div className="views" role="group" aria-label={ui.absences.viewsLabel}>
            {(['month', 'week'] as const).map((v) => (
              <button
                key={v}
                className={view === v ? 'on' : undefined}
                aria-pressed={view === v}
                onClick={() => {
                  // Back to the month the shown week starts in.
                  if (v === 'month' && view === 'week') goMonth(week.slice(0, 7))
                  onView(v)
                }}
              >
                {ui.absences.views[v]}
              </button>
            ))}
          </div>
          {view === 'week' ? (
            <>
              <button
                aria-label={ui.absences.previousWeek}
                onClick={() => onWeek(addDays(week, -7))}
              >
                ◀
              </button>
              <h2>{formatPeriod(weekDays)}</h2>
              <button aria-label={ui.absences.nextWeek} onClick={() => onWeek(addDays(week, 7))}>
                ▶
              </button>
              <TodayButton away={week !== mondayOf(now)} onClick={() => onWeek(mondayOf(now))} />
            </>
          ) : (
            <>
              <button
                aria-label={ui.absences.previous}
                onClick={() => goMonth(shiftMonth(month, -1))}
              >
                ◀
              </button>
              <h2>{monthLabel(month)}</h2>
              <button aria-label={ui.absences.next} onClick={() => goMonth(shiftMonth(month, 1))}>
                ▶
              </button>
              <TodayButton
                away={month !== now.slice(0, 7)}
                onClick={() => goMonth(now.slice(0, 7))}
              />
              <button
                className={report ? 'on' : undefined}
                aria-pressed={report}
                onClick={() => setReport(!report)}
              >
                {ui.absences.report.open}
              </button>
            </>
          )}
          <div className="kinds" role="group" aria-label={ui.absences.kindsLabel}>
            {KINDS.map((kind) => (
              <button
                key={kind}
                className={brush === kind ? `on kind-${kind}` : `kind-${kind}`}
                aria-pressed={brush === kind}
                onClick={() => setBrush(kind)}
              >
                {ui.absences.kinds[kind]}
              </button>
            ))}
          </div>
        </div>
        {showReport ? (
          <MonthReportPanel
            absences={state.absences}
            staff={state.staff}
            month={month}
            onClose={() => setReport(false)}
          />
        ) : (
          <>
            <p className="hint">{ui.absences.hint}</p>
            <AbsenceGrid
              state={state}
              dispatch={dispatch}
              people={people}
              days={byWeek ? weekDays : monthDays(month)}
              brush={brush}
              wide={byWeek}
            />
          </>
        )}
      </section>
      {showReport && (
        <MonthReportPrint absences={state.absences} staff={state.staff} month={month} />
      )}
    </>
  )
}
