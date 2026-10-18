import { Fragment, useEffect, useRef, useState } from 'react'
import { isBreakDay, isWorkingDay, mondayOf } from '../core/calendar'
import { cover, zeroHoleNeeds } from '../core/capacity'
import { ROLES, isHelper, type AbsenceKind, type Role, type Staff } from '../core/types'
import { dayHeader, ui, weekdayInitial } from '../i18n/hu'
import { groupCount, periodState, type Action, type AppState } from '../state/appState'
import { carryPatch, leaveBalance } from '../state/leave'
import { ActionDock } from './ActionDock'
import { today } from './dates'

type Props = {
  state: AppState
  dispatch: (action: Action) => void
  people: Staff[] // in roster order
  days: string[] // a month's days, or a week's working days
  brush: AbsenceKind
  wide?: boolean // the week view: wider cells, full day headers
}

/** People down, days across: click or drag along a row to paint the brush's kind, or clear it. */
export function AbsenceGrid({ state, dispatch, people, days, brush, wide }: Props) {
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

  const year = days[0].slice(0, 4)
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
  const setCarry = (person: Staff, value: string) =>
    dispatch({ type: 'updateStaff', id: person.id, patch: carryPatch(person, year, value) })
  const carryPerson = people.find((p) => p.id === carryOpen)
  // Enough left for the week's groups? The same counting as the roster screen's day chips; only
  // teachers and nannies get the orange mark (v3-c).
  const coverage = (role: Role, date: string) => {
    const isAway = (p: Staff) => kindOf.has(`${p.id}|${date}`)
    const away = people.filter((p) => p.role === role && isAway(p)).length
    if (isHelper(role)) return { away, short: false }
    const [teachers, nannies, assistants, civils] = ROLES.map(
      (r) => people.filter((p) => p.role === r && !isAway(p)).length,
    )
    const have = cover({ teachers, nannies, assistants, civils })
    const groups = groupCount(periodState(state, mondayOf(date)))
    const needs = zeroHoleNeeds(groups)
    // Why it is orange, on hover: the mark can come from a helper's absence too (2026-10-18).
    if (role === 'teacher') {
      const short = have.teachers < needs.teachers
      const hint = ui.absences.shortTeachers(teachers, assistants, groups, needs.teachers)
      return { away, short, hint: short ? hint : undefined }
    }
    const short = have.nannies < needs.nannies
    return {
      away,
      short,
      hint: short ? ui.absences.shortNannies(nannies, civils, needs.nannies) : undefined,
    }
  }

  return (
    <>
      <div className="scroll">
        <table className={wide ? 'absence-grid wide' : 'absence-grid'}>
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
                  {wide ? (
                    dayHeader(date)
                  ) : (
                    <>
                      {weekdayInitial(date)}
                      <br />
                      {Number(date.slice(8))}
                    </>
                  )}
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
                        {ui.staff.sections[s.role]}
                      </th>
                    </tr>
                  )}
                  <tr>
                    <th className="name">
                      {s.displayName || s.fullName}
                      {balance && (
                        <button
                          className={balance.remaining < 0 ? 'leave-balance over' : 'leave-balance'}
                          title={ui.absences.balanceHint(
                            year,
                            balance.used,
                            s.leaveAllowance ?? 0,
                            s.leaveCarry?.[year] ?? 0,
                          )}
                          onClick={() => setCarryOpen(carryOpen === s.id ? undefined : s.id)}
                        >
                          {ui.absences.balance(balance.remaining)}
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
                  {(i === people.length - 1 || people[i + 1].role !== s.role) && (
                    <tr className="away-row">
                      <th scope="row" className="count" title={ui.absences.shortHint}>
                        {ui.absences.away[s.role]}
                      </th>
                      {days.map((date) => {
                        if (!isWorkingDay(date)) return <td key={date} className="off" />
                        const { away, short, hint } = coverage(s.role, date)
                        return (
                          <td
                            key={date}
                            className={short ? 'count short' : 'count'}
                            title={hint}
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
      {/* Floats in the dock, not as a row of its own, so the grid never moves while she types. */}
      <ActionDock>
        {carryPerson && (
          <div className="leave-editor">
            <strong>{carryPerson.displayName || carryPerson.fullName}</strong>
            <label>
              {ui.absences.carry(year)}{' '}
              <input
                type="number"
                min={0}
                value={carryPerson.leaveCarry?.[year] ?? 0}
                onChange={(e) => setCarry(carryPerson, e.target.value)}
              />
            </label>
            <button onClick={() => setCarryOpen(undefined)}>{ui.roster.done}</button>
          </div>
        )}
      </ActionDock>
    </>
  )
}
