import { useEffect, useRef, useState } from 'react'
import { defaultWeek } from '../core/calendar'
import { ui } from '../i18n/hu'
import type { AppState } from '../state/appState'
import { useUndo } from '../state/undo'
import { useAppState } from '../state/useAppState'
import { useSingleWindow } from './singleWindow'
import { AbsenceScreen, type AbsenceView } from '../ui/AbsenceScreen'
import { today } from '../ui/dates'
import { FirstLaunch } from '../ui/FirstLaunch'
import { Footer } from '../ui/Footer'
import { RosterScreen } from '../ui/RosterScreen'
import { StaffScreen } from '../ui/StaffScreen'
import { OtherWindow } from '../ui/OtherWindow'
import { ThemeToggle } from '../ui/ThemeToggle'
import { shownWarningCount } from '../ui/warningDays'

type Tab = 'staff' | 'absences' | 'roster'
const TABS: Tab[] = ['staff', 'absences', 'roster']

export function App() {
  const app = useAppState()
  const { state, dispatch, persisted, storageError } = app
  const history = useUndo(dispatch)
  // New data (a restore, the demo, a fresh start): the old undo steps no longer apply.
  const replace = (next: AppState | null) => {
    history.reset()
    app.replace(next)
  }
  const [chosen, setChosen] = useState<Tab>()
  const [week, setWeek] = useState(() => defaultWeek(today()))
  const [absenceView, setAbsenceView] = useState<AbsenceView>('month')

  // Back from another window: it may have changed the data, so read it again.
  const single = useSingleWindow()
  const { reload } = app
  const { reset } = history
  const wasElsewhere = useRef(false)
  useEffect(() => {
    if (single.status === 'elsewhere') wasElsewhere.current = true
    if (single.status === 'active' && wasElsewhere.current) {
      wasElsewhere.current = false
      reset()
      reload()
    }
  }, [single.status, reload, reset])

  if (single.status === 'elsewhere') return <OtherWindow onTakeOver={single.takeOver} />
  if (state === undefined || single.status === 'checking') {
    return <p className="loading">{ui.loading}</p>
  }
  if (state === null) return <FirstLaunch onReady={replace} storageError={storageError} />

  const tab = chosen ?? (state.staff.length === 0 ? 'staff' : 'roster')
  const warningCount = shownWarningCount(state.periods[week]?.roster?.warnings ?? [])

  return (
    <div className="app">
      {state.demo && (
        <div className="demo-banner">
          {ui.demoBanner}
          <button onClick={() => replace(null)}>{ui.leaveDemo}</button>
        </div>
      )}
      <nav className="tabs">
        {TABS.map((t) => (
          <button key={t} className={t === tab ? 'tab active' : 'tab'} onClick={() => setChosen(t)}>
            {ui.tabs[t]}
            {t === 'roster' && warningCount > 0 && <span className="badge">{warningCount}</span>}
          </button>
        ))}
        <ThemeToggle />
      </nav>
      <main>
        {tab === 'staff' && <StaffScreen state={state} dispatch={dispatch} />}
        {tab === 'absences' && (
          <AbsenceScreen
            state={state}
            dispatch={dispatch}
            week={week}
            onWeek={setWeek}
            view={absenceView}
            onView={setAbsenceView}
          />
        )}
        {tab === 'roster' && (
          <RosterScreen
            state={state}
            dispatch={dispatch}
            week={week}
            onWeek={setWeek}
            history={history}
          />
        )}
      </main>
      <Footer
        state={state}
        dispatch={dispatch}
        replace={replace}
        persisted={persisted}
        storageError={storageError}
      />
    </div>
  )
}
