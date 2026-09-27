import { useState } from 'react'
import { addDays, periodForWeek } from '../core/calendar'
import { dayCapacities } from '../core/capacity'
import type { Warning } from '../core/types'
import { footnotes } from '../export/views'
import { rosterFileName, rosterWorkbook, workbookBytes } from '../export/xlsx'
import { ui } from '../i18n/hu'
import { groupCount, periodState, reducer, type Action, type AppState } from '../state/appState'
import { backupJson } from '../state/backup'
import type { UndoHistory } from '../state/undo'
import { inputKey, solveInputFor } from '../state/solveInput'
import { SolveFailure, solveInWorker } from '../worker/client'
import { changedCells } from './changedCells'
import { DayChips } from './DayChips'
import { DayEditor } from './DayEditor'
import { today } from './dates'
import { XLSX_TYPE, download } from './download'
import { GroupLabels } from './GroupLabels'
import { PrintView } from './PrintView'
import { RosterTable } from './RosterTable'
import { UndoBar } from './UndoBar'
import { WarningsPanel } from './WarningsPanel'
import type { DayFix } from './warningDays'
import { WeekBar } from './WeekBar'

type Props = {
  state: AppState
  dispatch: (action: Action) => void
  week: string
  onWeek: (week: string) => void
  history: UndoHistory
}

/**
 * One week: its inputs, Számol, the warnings and the roster. A week that is over is archived —
 * what happened is shown and printable, but nothing can be solved, fixed or changed.
 */
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
  const archived = addDays(week, 6) < today() // the whole week, Sunday included, is behind us
  const open = !archived && days.length > 0
  const stale = !archived && roster !== undefined && period.rosterInputKey !== inputKey(input)
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

  const editingPlan = open ? period.dayPlans.find((d) => d.date === editing) : undefined
  const canSolve = open && input.staff.length > 0

  return (
    <>
      <section
        className={archived ? 'roster-screen screen-only archived' : 'roster-screen screen-only'}
      >
        <WeekBar
          week={week}
          days={days}
          hasRoster={hasRoster}
          onWeek={onWeek}
          archived={archived}
          groups={
            archived
              ? undefined
              : {
                  count: groups,
                  onChange: (count) => dispatch({ type: 'setGroups', week, groups: count }),
                }
          }
        />

        {archived && (
          <p className="archived-note">{roster ? ui.roster.archived : ui.roster.archivedEmpty}</p>
        )}
        {!archived && days.length === 0 && <p>{ui.roster.noDays}</p>}
        {open && input.staff.length === 0 && <p>{ui.roster.noStaff}</p>}

        {open && <DayChips capacities={capacities} onEdit={setEditing} />}
        {editingPlan && (
          <DayEditor
            plan={editingPlan}
            onOverride={(count) =>
              dispatch({ type: 'setOverride', week, date: editingPlan.date, groups: count })
            }
            onDone={() => setEditing(undefined)}
          />
        )}
        {open && (
          <GroupLabels
            groups={groups}
            labels={period.groupLabels}
            onChange={(group, label) => dispatch({ type: 'setGroupLabel', week, group, label })}
          />
        )}

        {canSolve && (
          <button
            className={stale && !solving ? 'primary big attention' : 'primary big'}
            disabled={solving}
            onClick={() => void solve(state)}
          >
            {solving ? ui.roster.solving : ui.roster.solve}
          </button>
        )}
        {error && <p className="error">{error}</p>}
        {!roster && canSolve && <p>{ui.roster.notSolved}</p>}
        {lastChange && !archived && (
          <UndoBar
            change={lastChange}
            busy={solving}
            onUndo={() => history.undo(lastChange)}
            onAccept={() => history.accept(week)}
          />
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
                onFix={archived ? undefined : fix}
              />
              <RosterTable
                roster={roster}
                staff={state.staff}
                labels={period.groupLabels}
                highlight={hovered}
                changed={archived ? undefined : changed}
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
