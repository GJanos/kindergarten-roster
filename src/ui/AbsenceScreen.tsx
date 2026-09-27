import { Fragment, useEffect, useRef, useState } from 'react'
import { isBreakDay, isWorkingDay, mondayOf } from '../core/calendar'
import { zeroHoleNeeds } from '../core/capacity'
import type { AbsenceKind, Role, Staff } from '../core/types'
import { monthLabel, ui, weekdayInitial } from '../i18n/hu'
import { groupCount, periodState, type Action, type AppState } from '../state/appState'
import { leaveBalance } from '../state/leave'
import { monthDays, shiftMonth, today } from './dates'

type Props = { state: AppState; dispatch: (action: Action) => void }

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
  const [carryOpen, setCarryOpen] = useState<string>() // whose carry-over editor is open
  // While the button is held, dragging along a row does the same to every cell: paint or clear.
  const drag = useRef<{ staffId: string; paint: boolean } | null>(null)
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
  const year = month.slice(0, 4)
  const now = today()
  const classes = (...names: (string | false)[]) => names.filter(Boolean).join(' ') || undefined
  const tracksLeave = people.some((s) => s.leaveAllowance !== undefined)
  const kindOf = new Map(state.absences.map((a) => [`${a.staffId}|${a.date}`, a.kind]))
  const set = (staffId: string, date: string, paint: boolean) =>
    dispatch(
      paint
        ? { type: 'setAbsent', staffId, dates: [date], absent: true, kind: brush }
        : { type: 'setAbsent', staffId, dates: [date], absent: false },
    )
  const setCarry = (person: Staff, value: string) => {
    const carry = { ...person.leaveCarry }
    if (value === '') delete carry[year]
    else carry[year] = Math.max(0, Math.round(Number(value)))
    dispatch({
      type: 'updateStaff',
      id: person.id,
      patch: { leaveCarry: Object.keys(carry).length > 0 ? carry : undefined },
    })
  }
  // Enough left for the week's groups? The same need as the roster screen's day chips.
  const coverage = (role: Role, date: string) => {
    const members = people.filter((p) => p.role === role)
    const away = members.filter((p) => kindOf.has(`${p.id}|${date}`)).length
    const needs = zeroHoleNeeds(groupCount(periodState(state, mondayOf(date))))
    const need = role === 'teacher' ? needs.teachers : needs.nannies
    return { away, short: members.length - away < need }
  }

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
        <div className="toggle kinds" role="group" aria-label={ui.absences.kindsLabel}>
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
      <div className="scroll">
        <table className="absence-grid">
          <thead>
            <tr>
              <th className="name">{tracksLeave ? ui.absences.leaveHeader(year) : ''}</th>
              {days.map((date) => (
                <th
                  key={date}
                  className={classes(
                    !isWorkingDay(date) && 'off',
                    isBreakDay(date) && 'break',
                    date === now && 'today',
                  )}
                >
                  {weekdayInitial(date)}
                  <br />
                  {Number(date.slice(8))}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {people.map((s, i) => {
              const balance =
                s.leaveAllowance === undefined ? undefined : leaveBalance(state.absences, s, year)
              return (
                <Fragment key={s.id}>
                  {/* One grid, so a day's column still reads straight down across both roles. */}
                  {(i === 0 || people[i - 1].role !== s.role) && (
                    <tr>
                      <th scope="row" colSpan={days.length + 1} className="section">
                        {s.role === 'teacher' ? ui.staff.teachers : ui.staff.nannies}
                      </th>
                    </tr>
                  )}
                  <tr>
                    <th className="name">
                      {s.displayName || s.fullName}
                      {balance && (
                        <button
                          className={
                            balance.used > balance.total ? 'leave-balance over' : 'leave-balance'
                          }
                          title={ui.absences.balanceHint(year)}
                          onClick={() => setCarryOpen(carryOpen === s.id ? undefined : s.id)}
                        >
                          {ui.absences.balance(balance.used, balance.total)}
                        </button>
                      )}
                    </th>
                    {days.map((date, d) => {
                      if (!isWorkingDay(date))
                        return <td key={date} className={classes('off', date === now && 'today')} />
                      const kind = kindOf.get(`${s.id}|${date}`)
                      // The same kind next door: the bar runs on, so a week off reads as one stretch.
                      const joins = (other?: string) =>
                        other !== undefined &&
                        isWorkingDay(other) &&
                        kind !== undefined &&
                        kindOf.get(`${s.id}|${other}`) === kind
                      const className = classes(
                        kind !== undefined && 'absent',
                        kind ?? false,
                        joins(days[d - 1]) && 'join-left',
                        joins(days[d + 1]) && 'join-right',
                        date === now && 'today',
                      )
                      return (
                        <td
                          key={date}
                          className={className}
                          aria-label={`${s.displayName} ${date}`}
                          onPointerDown={(e) => {
                            e.preventDefault()
                            const paint = kind !== brush
                            drag.current = { staffId: s.id, paint }
                            set(s.id, date, paint)
                          }}
                          onPointerEnter={() => {
                            const held = drag.current
                            if (!held || held.staffId !== s.id) return
                            if (held.paint ? kind !== brush : kind !== undefined)
                              set(s.id, date, held.paint)
                          }}
                        >
                          {kind && (
                            <span className="bar-mark">
                              {joins(days[d - 1]) ? '' : ui.absences.letters[kind]}
                            </span>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                  {carryOpen === s.id && (
                    <tr>
                      <td colSpan={days.length + 1} className="leave-editor">
                        <label>
                          {ui.absences.carry(year)}{' '}
                          <input
                            type="number"
                            min={0}
                            value={s.leaveCarry?.[year] ?? ''}
                            onChange={(e) => setCarry(s, e.target.value)}
                          />
                        </label>
                        <button onClick={() => setCarryOpen(undefined)}>{ui.roster.done}</button>
                      </td>
                    </tr>
                  )}
                  {(i === people.length - 1 || people[i + 1].role !== s.role) && (
                    <tr className="away-row">
                      <th scope="row" className="count" title={ui.absences.shortHint}>
                        {ui.absences.away[s.role]}
                      </th>
                      {days.map((date) => {
                        if (!isWorkingDay(date)) return <td key={date} className="off" />
                        const { away, short } = coverage(s.role, date)
                        return (
                          <td
                            key={date}
                            className={short ? 'count short' : 'count'}
                            aria-label={`${ui.absences.away[s.role]} ${date}`}
                          >
                            {away || ''}
                          </td>
                        )
                      })}
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
