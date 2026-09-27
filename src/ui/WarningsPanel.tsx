import type { Warning } from '../core/types'
import { ui } from '../i18n/hu'

type Props = {
  warnings: Warning[]
  onHover: (warning?: Warning) => void
  onFix: (warning: Warning) => void
}

/** Above the result, by day then severity; hovering one highlights its cells. */
export function WarningsPanel({ warnings, onHover, onFix }: Props) {
  if (warnings.length === 0) return <p className="all-good">✓ {ui.roster.allGood}</p>
  return (
    <section className="warnings">
      <h3>
        {ui.roster.warnings} ({warnings.length})
      </h3>
      <ul>
        {warnings.map((w, i) => (
          <li
            key={`${w.code}-${w.date}-${i}`}
            className={`warning ${w.severity}`}
            onMouseEnter={() => onHover(w)}
            onMouseLeave={() => onHover(undefined)}
          >
            <span>{w.text}</span>
            {w.action && <span className="action"> {w.action}</span>}
            {w.fix && (
              <button className="fix" onClick={() => onFix(w)}>
                {ui.roster.fix(w.fix.date, w.fix.groups)}
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
