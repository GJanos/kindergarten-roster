import { useState } from 'react'
import { addDays, mondayOf, periodForWeek } from '../core/calendar'
import type { AbsenceKind, Staff } from '../core/types'
import { formatPeriod, monthLabel, ui } from '../i18n/hu'
import type { Action, AppState } from '../state/appState'
import { AbsenceGrid } from './AbsenceGrid'
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

/** Teachers first, then nannies, each by name. */
export function rosterOrder(staff: Staff[]): Staff[] {
  return [...staff].sort((a, b) =>
    a.role === b.role
      ? (a.displayName || a.fullName).localeCompare(b.displayName || b.fullName, 'hu')
      : a.role === 'teacher'
        ? -1
        : 1,
  )
}

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

  const people = rosterOrder(state.staff.filter((s) => s.active))
  if (people.length === 0) return <p>{ui.absences.noStaff}</p>
  const now = today()
  const weekDays = periodForWeek(week).days
  // A week with no working day (all holidays) has nothing to paint; the month view still shows it.
  const byWeek = view === 'week' && weekDays.length > 0

  return (
    <section className="absence-screen">
      <div className="bar">
        <div className="views" role="group" aria-label={ui.absences.viewsLabel}>
          {(['month', 'week'] as const).map((v) => (
            <button
              key={v}
              className={view === v ? 'on' : undefined}
              aria-pressed={view === v}
              onClick={() => {
                // Back to the month the shown week starts in.
                if (v === 'month' && view === 'week') setMonth(week.slice(0, 7))
                onView(v)
              }}
            >
              {ui.absences.views[v]}
            </button>
          ))}
        </div>
        {view === 'week' ? (
          <>
            <button aria-label={ui.absences.previousWeek} onClick={() => onWeek(addDays(week, -7))}>
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
              onClick={() => setMonth(shiftMonth(month, -1))}
            >
              ◀
            </button>
            <h2>{monthLabel(month)}</h2>
            <button aria-label={ui.absences.next} onClick={() => setMonth(shiftMonth(month, 1))}>
              ▶
            </button>
            <TodayButton
              away={month !== now.slice(0, 7)}
              onClick={() => setMonth(now.slice(0, 7))}
            />
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
      <p className="hint">{ui.absences.hint}</p>
      <AbsenceGrid
        state={state}
        dispatch={dispatch}
        people={people}
        days={byWeek ? weekDays : monthDays(month)}
        brush={brush}
        wide={byWeek}
      />
    </section>
  )
}
