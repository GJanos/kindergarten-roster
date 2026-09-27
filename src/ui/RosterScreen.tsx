import { useState } from 'react'
import { addDays, periodForWeek } from '../core/calendar'
import { dayCapacities, zeroHoleNeeds, type DayCapacity } from '../core/capacity'
import type { Warning } from '../core/types'
import { footnotes } from '../export/views'
import { rosterFileName, rosterWorkbook, workbookBytes } from '../export/xlsx'
import { capitalize, dayHeader, formatDate, formatPeriod, groupName, ui } from '../i18n/hu'
import { groupCount, periodState, reducer, type Action, type AppState } from '../state/appState'
import { backupJson } from '../state/backup'
import type { UndoHistory } from '../state/undo'
import { inputKey, solveInputFor } from '../state/solveInput'
import { SolveFailure, solveInWorker } from '../worker/client'
import { changedCells } from './changedCells'
import { XLSX_TYPE, download } from './download'
import { PrintView } from './PrintView'
import { RosterTable } from './RosterTable'
import { Info } from './Info'
import { WarningsPanel } from './WarningsPanel'
import type { DayFix } from './warningDays'

type Props = {
  state: AppState
  dispatch: (action: Action) => void
  week: string
  onWeek: (week: string) => void
  history: UndoHistory
}

/** Warns, never blocks: Számol always works. */
function dayStatus(c: DayCapacity): { ok: boolean; text: string } {
  if (c.closed) return { ok: true, text: ui.roster.closed }
  const needs = zeroHoleNeeds(c.groups)
  const notes: string[] = []
  if (c.teachers < needs.teachers)
    notes.push(ui.roster.fewTeachers(c.teachers, c.groups, needs.teachers))
  if (c.nannies < needs.nannies) notes.push(ui.roster.fewNannies(c.nannies, needs.nannies))
  if (c.override !== undefined) notes.push(ui.roster.manual(c.groups))
  return {
    ok: notes.length === 0 || (notes.length === 1 && c.override !== undefined),
    text: notes.join(' · '),
  }
}

export function RosterScreen({ state, dispatch, week, onWeek, history }: Props) {
  const [solving, setSolving] = useState(false)
  const [error, setError] = useState<string>()
  const [hovered, setHovered] = useState<Warning>()
  const [editing, setEditing] = useState<string>()

  const days = periodForWeek(week).days
  const period = periodState(state, week)
  const groups = groupCount(period)
  const input = solveInputFor(state, week)
  const capacities = days.length > 0 ? dayCapacities(input) : []
  const roster = period.roster
  const stale = roster !== undefined && period.rosterInputKey !== inputKey(input)
  const hasRoster = (monday: string) => state.periods[monday]?.roster !== undefined

  /**
   * Solves `current` and saves the result. With `change` (the input edit that led here, and its
   * inverse) or an earlier roster to go back to, it also records an undo step.
   */
  const solve = async (current: AppState, change?: { label: string; inverse: Action }) => {
    const solveInput = solveInputFor(current, week)
    const before = current.periods[week]
    const undoInput = change ? [change.inverse] : []
    setSolving(true)
    setError(undefined)
    try {
      const result = await solveInWorker(solveInput, {
        solvedAt: new Date().toISOString(),
        appVersion: __APP_VERSION__,
      })
      dispatch({ type: 'saveRoster', week, roster: result, inputKey: inputKey(solveInput) })
      if (change || before?.roster) {
        const changed = changedCells(before?.roster, result, current.staff, before?.groupLabels)
        history.record({
          week,
          label: change?.label ?? ui.roster.didSolve,
          undo: [
            ...undoInput,
            {
              type: 'restoreRoster',
              week,
              roster: before?.roster,
              inputKey: before?.rosterInputKey,
            },
          ],
          changed: [...changed],
        })
      }
    } catch (failure) {
      // The input edit already happened; it stays undoable even though no roster came back.
      if (change) history.record({ week, label: change.label, undo: undoInput, changed: [] })
      setError(
        failure instanceof SolveFailure && failure.reason === 'invalid'
          ? ui.roster.errorInvalid
          : ui.roster.errorGeneric,
      )
    } finally {
      setSolving(false)
    }
  }

  // One click: reduce the day or call someone in, then solve again.
  const fix = (dayFix: DayFix) => {
    const { date } = dayFix
    let action: Action, inverse: Action, label: string
    if (dayFix.kind === 'setGroups') {
      const previous = period.dayPlans.find((d) => d.date === date)?.override
      action = { type: 'setOverride', week, date, groups: dayFix.groups }
      inverse = { type: 'setOverride', week, date, groups: previous }
      label = ui.roster.didSetGroups(date, dayFix.groups)
    } else {
      const { staffId } = dayFix
      action = { type: 'setAbsent', staffId, dates: [date], absent: false }
      inverse = { type: 'setAbsent', staffId, dates: [date], absent: true }
      label = ui.roster.didCallIn(dayFix.name, date)
    }
    dispatch(action)
    void solve(reducer(state, action), { label, inverse })
  }

  const lastChange = history.latest(week)
  const changed = new Set(lastChange?.changed)

  const exportExcel = async () => {
    if (!roster) return
    const workbook = await rosterWorkbook(roster, state.staff, state.absences, {
      groupLabels: period.groupLabels,
      footnotes: footnotes(roster),
      backupJson: backupJson(state),
    })
    download(await workbookBytes(workbook), rosterFileName(roster), XLSX_TYPE)
    dispatch({ type: 'markBackedUp', at: new Date().toISOString() })
  }

  const editingPlan = period.dayPlans.find((d) => d.date === editing)

  return (
    <>
      <section className="roster-screen screen-only">
        <div className="bar">
          <button aria-label={ui.roster.previousWeek} onClick={() => onWeek(addDays(week, -7))}>
            ◀{hasRoster(addDays(week, -7)) && ' •'}
          </button>
          <h2>
            {days.length > 0 ? formatPeriod(days) : formatDate(week)}
            {hasRoster(week) && (
              <span className="dot" title={ui.roster.saved}>
                {' '}
                •
              </span>
            )}
          </h2>
          <button aria-label={ui.roster.nextWeek} onClick={() => onWeek(addDays(week, 7))}>
            {hasRoster(addDays(week, 7)) && '• '}▶
          </button>
          <span className="groups">
            {ui.roster.groups}
            <button
              onClick={() => dispatch({ type: 'setGroups', week, groups: Math.max(1, groups - 1) })}
            >
              −
            </button>
            <strong>{groups}</strong>
            <button onClick={() => dispatch({ type: 'setGroups', week, groups: groups + 1 })}>
              +
            </button>
          </span>
        </div>

        {days.length === 0 && <p>{ui.roster.noDays}</p>}
        {days.length > 0 && input.staff.length === 0 && <p>{ui.roster.noStaff}</p>}

        {days.length > 0 && (
          <div className="capacity">
            {capacities.map((c) => {
              const status = dayStatus(c)
              return (
                <button
                  key={c.date}
                  className={status.ok ? 'day ok' : 'day warn'}
                  onClick={() => setEditing(c.date)}
                >
                  <strong>{dayHeader(c.date)}</strong> {status.ok ? '✓' : '⚠'} {status.text}
                </button>
              )
            })}
            <Info text={ui.roster.daysHint} />
          </div>
        )}

        {editingPlan && (
          <div className="day-editor">
            <strong>{capitalize(dayHeader(editingPlan.date))}</strong> {ui.roster.dayGroups}
            <button
              onClick={() => {
                const current = editingPlan.override ?? editingPlan.requestedGroups
                dispatch({
                  type: 'setOverride',
                  week,
                  date: editingPlan.date,
                  groups: Math.max(0, current - 1),
                })
              }}
            >
              −
            </button>
            <strong>{editingPlan.override ?? editingPlan.requestedGroups}</strong>
            <button
              onClick={() => {
                const current = editingPlan.override ?? editingPlan.requestedGroups
                dispatch({ type: 'setOverride', week, date: editingPlan.date, groups: current + 1 })
              }}
            >
              +
            </button>
            <button
              onClick={() =>
                dispatch({ type: 'setOverride', week, date: editingPlan.date, groups: 0 })
              }
            >
              {ui.roster.closeDay}
            </button>
            <button onClick={() => dispatch({ type: 'setOverride', week, date: editingPlan.date })}>
              {ui.roster.resetDay}
            </button>
            <button onClick={() => setEditing(undefined)}>{ui.roster.done}</button>
          </div>
        )}

        {days.length > 0 && (
          <details className="labels">
            <summary>
              {groupName(1)}, {groupName(2)}… — nevek
            </summary>
            {Array.from({ length: groups }, (_, i) => (
              <label key={i}>
                {ui.roster.groupLabel(i + 1)}
                <input
                  value={period.groupLabels?.[i] ?? ''}
                  onChange={(e) =>
                    dispatch({ type: 'setGroupLabel', week, group: i + 1, label: e.target.value })
                  }
                />
              </label>
            ))}
          </details>
        )}

        {days.length > 0 && input.staff.length > 0 && (
          <button
            className={stale && !solving ? 'primary big attention' : 'primary big'}
            disabled={solving}
            onClick={() => void solve(state)}
          >
            {solving ? ui.roster.solving : ui.roster.solve}
          </button>
        )}
        {error && <p className="error">{error}</p>}
        {!roster && days.length > 0 && input.staff.length > 0 && <p>{ui.roster.notSolved}</p>}
        {lastChange && (
          <div className="undo-bar" aria-live="polite">
            <span>
              <strong>{lastChange.label}</strong> {ui.roster.changedCount(changed.size)}
            </span>
            <button
              className="primary"
              title={ui.roster.undoHint}
              disabled={solving}
              onClick={() => history.undo(lastChange)}
            >
              {ui.roster.undo}
            </button>
            <button title={ui.roster.acceptHint} onClick={() => history.accept(week)}>
              {ui.roster.accept}
            </button>
          </div>
        )}

        {roster && (
          <>
            {stale && (
              <div className="stale" role="status">
                <span>
                  <strong>{ui.roster.staleTitle}</strong> {ui.roster.stale}
                </span>
                <button className="primary" disabled={solving} onClick={() => void solve(state)}>
                  {ui.roster.resolve}
                </button>
              </div>
            )}
            <div className={stale ? 'result outdated' : 'result'}>
              <WarningsPanel
                warnings={roster.warnings}
                input={input}
                onHover={setHovered}
                onFix={fix}
              />
              <RosterTable
                roster={roster}
                staff={state.staff}
                labels={period.groupLabels}
                highlight={hovered}
                changed={changed}
              />
            </div>
            <div className="actions">
              <button className="big" onClick={() => window.print()}>
                {ui.roster.print}
              </button>
              <button className="big" onClick={() => void exportExcel()}>
                {ui.roster.excel}
              </button>
            </div>
          </>
        )}
      </section>
      {roster && (
        <PrintView
          roster={roster}
          staff={state.staff}
          absences={state.absences}
          labels={period.groupLabels}
        />
      )}
    </>
  )
}
