import { useState } from 'react'
import type { AbsenceKind, Staff } from '../core/types'
import { monthLabel, ui } from '../i18n/hu'
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

export function AbsenceScreen({ state, dispatch }: Props) {
  const [month, setMonth] = useState(() => today().slice(0, 7))
  const [brush, setBrush] = useState<AbsenceKind>('leave')

  const people = rosterOrder(state.staff.filter((s) => s.active))
  if (people.length === 0) return <p>{ui.absences.noStaff}</p>
  const now = today()

  return (
    <section className="absence-screen">
      <div className="bar">
        <button aria-label={ui.absences.previous} onClick={() => setMonth(shiftMonth(month, -1))}>
          ◀
        </button>
        <h2>{monthLabel(month)}</h2>
        <button aria-label={ui.absences.next} onClick={() => setMonth(shiftMonth(month, 1))}>
          ▶
        </button>
        {month !== now.slice(0, 7) && (
          <button onClick={() => setMonth(now.slice(0, 7))}>{ui.absences.today}</button>
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
        days={monthDays(month)}
        brush={brush}
      />
    </section>
  )
}
