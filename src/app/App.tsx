import { useState } from 'react'
import { defaultWeek } from '../core/calendar'
import { ui } from '../i18n/hu'
import type { AppState } from '../state/appState'
import { useUndo } from '../state/undo'
import { useAppState } from '../state/useAppState'
import { AbsenceScreen } from '../ui/AbsenceScreen'
import { today } from '../ui/dates'
import { FirstLaunch } from '../ui/FirstLaunch'
import { Footer } from '../ui/Footer'
import { RosterScreen } from '../ui/RosterScreen'
import { StaffScreen } from '../ui/StaffScreen'
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

  if (state === undefined) return <p className="loading">{ui.loading}</p>
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
        {tab === 'absences' && <AbsenceScreen state={state} dispatch={dispatch} />}
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
