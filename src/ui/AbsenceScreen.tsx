import { useEffect, useRef, useState } from 'react'
import { isWorkingDay } from '../core/calendar'
import type { Staff } from '../core/types'
import { monthLabel, ui, weekdayInitial } from '../i18n/hu'
import type { Action, AppState } from '../state/appState'
import { monthDays, shiftMonth, today } from './dates'

type Props = { state: AppState; dispatch: (action: Action) => void }

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
  // While the button is held, dragging along a row sets every cell to the same value.
  const drag = useRef<{ staffId: string; absent: boolean } | null>(null)
  useEffect(() => {
    const stop = () => {
      drag.current = null
    }
    window.addEventListener('pointerup', stop)
    return () => window.removeEventListener('pointerup', stop)
  }, [])

  const people = rosterOrder(state.staff.filter((s) => s.active))
  if (people.length === 0) return <p>{ui.absences.noStaff}</p>
  const days = monthDays(month)
  const absent = new Set(state.absences.map((a) => `${a.staffId}|${a.date}`))
  const mark = (staffId: string, date: string, value: boolean) =>
    dispatch({ type: 'setAbsent', staffId, dates: [date], absent: value })

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
      </div>
      <p className="hint">{ui.absences.hint}</p>
      <div className="scroll">
        <table className="absence-grid">
          <thead>
            <tr>
              <th />
              {days.map((date) => (
                <th key={date} className={isWorkingDay(date) ? undefined : 'off'}>
                  {weekdayInitial(date)}
                  <br />
                  {Number(date.slice(8))}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {people.flatMap((s, i) => [
              // One grid, so a day's column still reads straight down across both roles.
              ...(i === 0 || people[i - 1].role !== s.role
                ? [
                    <tr key={s.role}>
                      <th scope="row" colSpan={days.length + 1} className="section">
                        {s.role === 'teacher' ? ui.staff.teachers : ui.staff.nannies}
                      </th>
                    </tr>,
                  ]
                : []),
              <tr key={s.id}>
                <th className="name">{s.displayName || s.fullName}</th>
                {days.map((date) => {
                  if (!isWorkingDay(date)) return <td key={date} className="off" />
                  const isAbsent = absent.has(`${s.id}|${date}`)
                  return (
                    <td
                      key={date}
                      className={isAbsent ? 'absent' : undefined}
                      aria-label={`${s.displayName} ${date}`}
                      onPointerDown={(e) => {
                        e.preventDefault()
                        drag.current = { staffId: s.id, absent: !isAbsent }
                        mark(s.id, date, !isAbsent)
                      }}
                      onPointerEnter={() => {
                        const held = drag.current
                        if (held && held.staffId === s.id && held.absent !== isAbsent)
                          mark(s.id, date, held.absent)
                      }}
                    >
                      {isAbsent ? '✕' : ''}
                    </td>
                  )
                })}
              </tr>,
            ])}
          </tbody>
        </table>
      </div>
    </section>
  )
}
