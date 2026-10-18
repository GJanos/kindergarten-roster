import { ui } from '../i18n/hu'
import { AUTOSAVE_MINUTES } from '../state/autosave'
import type { Autosave } from './useAutosave'

const clock = (iso: string) => {
  const at = new Date(iso)
  return `${at.getHours()}:${String(at.getMinutes()).padStart(2, '0')}`
}

/** The footer's autosave part (2026-10-18): off, on, or a visible reason why it is not saving. */
export function AutosaveControls({ auto }: { auto: Autosave }) {
  const { status } = auto
  if (status === 'unsupported' || status === 'loading') return null
  if (status === 'demo') return <span className="note">{ui.autosave.demo}</span>
  if (status === 'off') {
    return (
      <button title={ui.autosave.hint} onClick={() => void auto.enable()}>
        {ui.autosave.enable}
      </button>
    )
  }
  if (status === 'paused') {
    return (
      <span className="autosave-alert">
        {ui.autosave.paused}{' '}
        <button className="primary" onClick={() => void auto.allow()}>
          {ui.autosave.allow}
        </button>
      </span>
    )
  }
  if (status === 'failed') {
    return (
      <span className="autosave-alert">
        <span className="error">{ui.autosave.failed}</span>{' '}
        <button onClick={() => void auto.retry()}>{ui.autosave.retry}</button>
      </span>
    )
  }
  return (
    <span className="autosave">
      <span>
        {auto.savedAt && auto.fileName
          ? ui.autosave.saved(clock(auto.savedAt), auto.folder ?? '', auto.fileName)
          : ui.autosave.on(auto.folder ?? '')}
      </span>
      <select
        aria-label={ui.autosave.interval}
        value={auto.minutes}
        onChange={(e) => void auto.setMinutes(Number(e.target.value))}
      >
        {AUTOSAVE_MINUTES.map((minutes) => (
          <option key={minutes} value={minutes}>
            {ui.autosave.every(minutes)}
          </option>
        ))}
      </select>
      <button className="small" onClick={() => void auto.disable()}>
        {ui.autosave.disable}
      </button>
    </span>
  )
}
