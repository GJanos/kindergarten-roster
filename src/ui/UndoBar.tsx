import { ui } from '../i18n/hu'
import type { UndoEntry } from '../state/undo'

type Props = {
  change: UndoEntry
  busy: boolean
  onUndo: () => void
  onAccept: () => void
}

/** The last change, how many cells it altered, and the way back. */
export function UndoBar({ change, busy, onUndo, onAccept }: Props) {
  return (
    <div className="undo-bar" aria-live="polite">
      <span>
        <strong>{change.label}</strong> {ui.roster.changedCount(change.changed.length)}
      </span>
      <button className="primary" title={ui.roster.undoHint} disabled={busy} onClick={onUndo}>
        {ui.roster.undo}
      </button>
      <button title={ui.roster.acceptHint} onClick={onAccept}>
        {ui.roster.accept}
      </button>
      {change.details && (
        <div className="undo-details">
          {change.details.map((section) => (
            <section key={section.title}>
              <strong>{section.title}</strong>
              {section.items.length > 0 && (
                <ul>
                  {section.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
