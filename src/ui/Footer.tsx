import { useState } from 'react'
import { sinceText, ui } from '../i18n/hu'
import type { Action, AppState } from '../state/appState'
import { backupFileName, backupJson, readBackup } from '../state/backup'
import { daysBetween, today } from './dates'
import { download } from './download'
import { FileButton } from './FileButton'

type Props = {
  state: AppState
  dispatch: (action: Action) => void
  replace: (state: AppState) => void
  persisted?: boolean
  storageError: boolean
}

/** On every screen: when she last saved a backup, and the buttons to save or restore one. */
export function Footer({ state, dispatch, replace, persisted, storageError }: Props) {
  const [error, setError] = useState<string>()
  const age = state.lastBackupAt ? daysBetween(state.lastBackupAt.slice(0, 10), today()) : undefined
  const overdue = age === undefined || age >= 7

  const backup = () => {
    download(backupJson(state), backupFileName(today()), 'application/json')
    dispatch({ type: 'markBackedUp', at: new Date().toISOString() })
  }
  const restore = async (file: File) => {
    try {
      const next = await readBackup(file.name, await file.arrayBuffer())
      if (window.confirm(ui.confirmRestore)) replace(next)
      setError(undefined)
    } catch {
      setError(ui.restoreFailed)
    }
  }

  return (
    <footer className={overdue ? 'footer overdue' : 'footer'}>
      <span>
        {ui.footer.lastBackup}{' '}
        <strong>{age === undefined ? ui.footer.never : sinceText(age)}</strong>
      </span>
      <button onClick={backup}>{ui.footer.backup}</button>
      <FileButton accept=".json,.xlsx" onFile={(file) => void restore(file)}>
        {ui.footer.restore}
      </FileButton>
      {persisted === false && <span className="note">{ui.footer.notPersisted}</span>}
      {storageError && <span className="error">{ui.footer.saveFailed}</span>}
      {error && <span className="error">{error}</span>}
    </footer>
  )
}
