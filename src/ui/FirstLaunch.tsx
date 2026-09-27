import { useState } from 'react'
import { demoState } from '../demo/demoData'
import { ui } from '../i18n/hu'
import { emptyState, type AppState } from '../state/appState'
import { readBackup } from '../state/backup'
import { today } from './dates'
import { FileButton } from './FileButton'

export function FirstLaunch(props: { onReady: (state: AppState) => void; storageError: boolean }) {
  const [error, setError] = useState<string>()
  const restore = async (file: File) => {
    try {
      props.onReady(await readBackup(file.name, await file.arrayBuffer()))
    } catch {
      setError(ui.restoreFailed)
    }
  }
  return (
    <main className="first-launch">
      <h1>{ui.appName}</h1>
      {props.storageError && <p className="error">{ui.firstLaunch.storageError}</p>}
      <p>{ui.firstLaunch.intro}</p>
      <button className="big" onClick={() => props.onReady(emptyState())}>
        {ui.firstLaunch.start}
      </button>
      <FileButton className="big" accept=".json,.xlsx" onFile={(file) => void restore(file)}>
        {ui.firstLaunch.restore}
      </FileButton>
      <button className="big" onClick={() => props.onReady(demoState(today()))}>
        {ui.firstLaunch.demo}
      </button>
      {error && <p className="error">{error}</p>}
    </main>
  )
}
