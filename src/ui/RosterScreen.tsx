import { useEffect, useState } from 'react'
import { addDays, periodForWeek } from '../core/calendar'
import { dayCapacities } from '../core/capacity'
import { editRoster, type Swap } from '../core/edit'
import { recalcInput } from '../core/recalc'
import type { Anchor, Warning } from '../core/types'
import { footnotes } from '../export/views'
import { rosterFileName, rosterWorkbook, workbookBytes } from '../export/xlsx'
import { ui } from '../i18n/hu'
import { groupCount, periodState, reducer, type Action, type AppState } from '../state/appState'
import { backupJson } from '../state/backup'
import { sickCall } from '../state/sickCall'
import type { UndoHistory } from '../state/undo'
import { inputKey, solveInputFor } from '../state/solveInput'
import { SolveFailure, solveInWorker } from '../worker/client'
import { changedCells } from './changedCells'
import { changeSummary } from './changeSummary'
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
  const [picked, setPicked] = useState<{ staffId: string; date: string }>()
  const [swapError, setSwapError] = useState<string>()
  const [choosing, setChoosing] = useState(false)
  const [sick, setSick] = useState<{ staffId: string; date: string; until: string }>()

  const days = periodForWeek(week).days
  const period = periodState(state, week)
  const groups = groupCount(period)
  const input = solveInputFor(state, week)
  const capacities = days.length > 0 ? dayCapacities(input) : []
  const roster = period.roster
  // Over once its last working day has passed (usually Friday; a working Saturday counts).
  const archived = (days.at(-1) ?? addDays(week, 6)) < today()
  const open = !archived && days.length > 0
  const stale = !archived && roster !== undefined && period.rosterInputKey !== inputKey(input)
  const hasRoster = (monday: string) => state.periods[monday]?.roster !== undefined

  const now = today()
  // Where a week in progress is re-planned from: today, or its next working day.
  const from = days.find((date) => date >= now)
  // Keeps what `kept` planned before `from`; undefined when it no longer fits the week.
  const anchorFor = (mode: Anchor['mode'], kept = roster): Anchor | undefined => {
    if (!kept || from === undefined || archived) return undefined
    const anchor: Anchor = { roster: kept, from, mode }
    return recalcInput(input, anchor) ? anchor : undefined
  }
  // Its first working day has come (Monday counts): solving keeps the past and asks how much.
  const started = days.length > 0 && days[0] <= now && anchorFor('minimal') !== undefined

  // Swaps only in a current, open roster, and not while a solve runs.
  const editable = roster !== undefined && !archived && !stale && !solving
  const nameOf = (id: string) => state.staff.find((s) => s.id === id)?.displayName ?? '?'
  // Re-solving throws hand edits away, so she is asked first.
  const mayDropEdits = () => !roster?.edited || window.confirm(ui.roster.confirmDropEdits)

  useEffect(() => {
    if (!picked) return
    const cancel = (event: KeyboardEvent) => event.key === 'Escape' && setPicked(undefined)
    window.addEventListener('keydown', cancel)
    return () => window.removeEventListener('keydown', cancel)
  }, [picked])

  const swap = (change: Swap) => {
    if (!roster) return
    const result = editRoster(input, roster, change, from)
    if (!result.ok) {
      setSwapError(ui.roster.swapRefused(result.violations.map((v) => v.rule)))
      return
    }
    dispatch({ type: 'saveRoster', week, roster: result.roster, inputKey: inputKey(input) })
    history.record({
      week,
      label: ui.roster.didSwap(nameOf(change.a), nameOf(change.b), change.date),
      undo: [{ type: 'restoreRoster', week, roster, inputKey: period.rosterInputKey }],
      changed: [...changedCells(roster, result.roster, state.staff, period.groupLabels)],
    })
  }

  // First click picks, a second on the same day swaps; another day moves the pick.
  const pick = (staffId: string, date: string) => {
    setSwapError(undefined)
    if (!picked || picked.date !== date) return setPicked({ staffId, date })
    setPicked(undefined)
    if (picked.staffId !== staffId) swap({ date, a: picked.staffId, b: staffId })
  }

  /**
   * Solves `current` and saves the result. With `change` (the input edit that led here, and its
   * inverse) or an earlier roster to go back to, it also records an undo step.
   */
  const solve = async (
    current: AppState,
    change?: { label: string; inverse: Action[] },
    mode?: Anchor['mode'],
  ) => {
    const solveInput = solveInputFor(current, week)
    const before = current.periods[week]
    const undoInput = change?.inverse ?? []
    const anchor = mode ? anchorFor(mode, before?.roster) : undefined
    setSolving(true)
    setError(undefined)
    try {
      const meta = { solvedAt: new Date().toISOString(), appVersion: __APP_VERSION__ }
      const result = await (anchor
        ? solveInWorker(solveInput, meta, anchor)
        : solveInWorker(solveInput, meta))
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
          ...(anchor
            ? { details: changeSummary(anchor.roster, result, anchor.from, current.staff, now) }
            : {}),
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
    // In a week in progress a fix changes as little as it can, so it need not ask about edits.
    if (!started && !mayDropEdits()) return
    const { date } = dayFix
    let action: Action, inverse: Action, label: string
    if (dayFix.kind === 'setGroups') {
      const previous = period.dayPlans.find((d) => d.date === date)?.override
      action = { type: 'setOverride', week, date, groups: dayFix.groups }
      inverse = { type: 'setOverride', week, date, groups: previous }
      label = ui.roster.didSetGroups(date, dayFix.groups)
    } else {
      const { staffId } = dayFix
      // Undo puts the absence back as it was: leave stays leave, sick stays sick.
      const kind = state.absences.find((a) => a.staffId === staffId && a.date === date)?.kind
      action = { type: 'setAbsent', staffId, dates: [date], absent: false }
      inverse = { type: 'setAbsent', staffId, dates: [date], absent: true, kind }
      label = ui.roster.didCallIn(dayFix.name, date)
    }
    dispatch(action)
    void solve(
      reducer(state, action),
      { label, inverse: [inverse] },
      started ? 'minimal' : undefined,
    )
  }

  // Számol and Újraszámol: a week in progress first asks how much may change.
  const askSolve = () => {
    if (started) return setChoosing(true)
    if (mayDropEdits()) void solve(state)
  }

  // "Beteg lett": mark the days sick, then change as few people as possible.
  const reportSick = ({
    staffId,
    date,
    until,
  }: {
    staffId: string
    date: string
    until: string
  }) => {
    setSick(undefined)
    const last = until < date ? date : until
    const call = sickCall(state, staffId, date, last)
    dispatch(call.action)
    void solve(
      reducer(state, call.action),
      { label: ui.recalc.didSick(nameOf(staffId), date, last), inverse: call.inverse },
      'minimal',
    )
  }

  const lastChange = history.latest(week)
  const changed = new Set(lastChange?.changed)

  const exportExcel = async () => {
    if (!roster) return
    const workbook = await rosterWorkbook(roster, state.staff, state.absences, {
      groupLabels: period.groupLabels,
      footnotes: footnotes(roster, state.staff),
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
          edited={roster?.edited === true}
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
            onClick={askSolve}
          >
            {solving ? ui.roster.solving : ui.roster.solve}
          </button>
        )}
        {error && <p className="error">{error}</p>}
        {choosing && (
          <div className="recalc-choice" role="group">
            <span>{ui.recalc.started}</span>
            <button
              className="primary"
              title={ui.recalc.minimalHint}
              onClick={() => {
                setChoosing(false)
                void solve(state, undefined, 'minimal')
              }}
            >
              {ui.recalc.minimal}
            </button>
            <button
              title={ui.recalc.fullHint}
              onClick={() => {
                setChoosing(false)
                if (mayDropEdits()) void solve(state, undefined, 'full')
              }}
            >
              {ui.recalc.full}
            </button>
            <button onClick={() => setChoosing(false)}>{ui.roster.cancel}</button>
          </div>
        )}
        {!roster && canSolve && <p>{ui.roster.notSolved}</p>}
        {lastChange && !archived && (
          <UndoBar
            change={lastChange}
            busy={solving}
            onUndo={() => history.undo(lastChange)}
            onAccept={() => history.accept(week)}
          />
        )}

        {picked && (
          <div className="swap-bar" aria-live="polite">
            <span>{ui.roster.picked(nameOf(picked.staffId), picked.date)}</span>
            {from !== undefined && picked.date >= from && (
              <button
                onClick={() => {
                  setSick({ ...picked, until: picked.date })
                  setPicked(undefined)
                }}
              >
                {ui.recalc.sick}
              </button>
            )}
            <button onClick={() => setPicked(undefined)}>{ui.roster.cancel}</button>
          </div>
        )}
        {sick && (
          <div className="swap-bar" aria-live="polite">
            <label>
              {ui.recalc.sickUntil(nameOf(sick.staffId), sick.date)}{' '}
              <input
                type="date"
                min={sick.date}
                value={sick.until}
                onChange={(event) => setSick({ ...sick, until: event.target.value || sick.date })}
              />
            </label>
            <button className="primary" disabled={solving} onClick={() => reportSick(sick)}>
              {ui.recalc.sickGo}
            </button>
            <button onClick={() => setSick(undefined)}>{ui.roster.cancel}</button>
          </div>
        )}
        {swapError && <p className="error">{swapError}</p>}
        {roster && (
          <>
            {stale && (
              <div className="stale" role="status">
                <span>
                  <strong>{ui.roster.staleTitle}</strong> {ui.roster.stale}
                </span>
                <button className="primary" disabled={solving} onClick={askSolve}>
                  {ui.roster.resolve}
                </button>
              </div>
            )}
            {roster.stoppedEarly && !archived && !stale && (
              <p className="stopped-early">{ui.roster.stoppedEarly}</p>
            )}
            <div className={stale ? 'result outdated' : 'result'}>
              <WarningsPanel
                warnings={roster.warnings}
                input={input}
                staff={state.staff}
                onHover={setHovered}
                onFix={archived ? undefined : fix}
                fixFrom={started ? from : undefined}
              />
              <RosterTable
                pick={editable ? { picked, onPick: pick } : undefined}
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
