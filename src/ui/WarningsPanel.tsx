import type { SolveInput, Warning } from '../core/types'
import { dayHeader, ui } from '../i18n/hu'
import { Info } from './Info'
import { warningDays, type DayFix } from './warningDays'

type Props = {
  warnings: Warning[]
  input: SolveInput
  onHover: (warning?: Warning) => void
  onFix: (fix: DayFix) => void
}

/** Above the result, one card per day; hovering a line highlights its cells. */
export function WarningsPanel({ warnings, input, onHover, onFix }: Props) {
  const { days, notes } = warningDays(warnings, input)
  const line = (w: Warning, text: string, key: string) => (
    <li
      key={key}
      className={`warning ${w.severity}`}
      onMouseEnter={() => onHover(w)}
      onMouseLeave={() => onHover(undefined)}
    >
      {text}
    </li>
  )

  return (
    <section className="warnings">
      {days.length === 0 ? (
        <p className="all-good">✓ {ui.roster.allGood}</p>
      ) : (
        <>
          <h3>
            {ui.roster.warnings} ({days.reduce((sum, d) => sum + d.items.length, 0)}){' '}
            <Info text={ui.roster.warningsHint} />
          </h3>
          <div className="warning-days">
            {days.map((day) => {
              const headingId = `warnings-${day.date}`
              return (
                <section
                  key={day.date}
                  className={day.holes > 0 ? 'warning-day red' : 'warning-day orange'}
                  aria-labelledby={headingId}
                >
                  <h4 id={headingId}>
                    {dayHeader(day.date)}
                    {day.holes > 0 && <span className="count">{ui.roster.holes(day.holes)}</span>}
                  </h4>
                  <ul>{day.items.map((w, i) => line(w, day.texts[i], `${w.code}-${i}`))}</ul>
                  {day.actions.map((action) => (
                    <p key={action} className="action">
                      {action}
                    </p>
                  ))}
                  {day.fixes.length > 0 && (
                    <div className="fixes">
                      {day.fixes.map((fix) =>
                        fix.kind === 'setGroups' ? (
                          <button
                            key={`groups-${fix.groups}`}
                            className="fix"
                            title={ui.roster.fixHint(fix.date, fix.groups)}
                            onClick={() => onFix(fix)}
                          >
                            {ui.roster.fix(fix.date, fix.groups)}
                          </button>
                        ) : (
                          <button
                            key={fix.staffId}
                            className="fix"
                            title={ui.roster.callInHint(fix.name, fix.date)}
                            onClick={() => onFix(fix)}
                          >
                            {ui.roster.callIn(fix.name)}
                          </button>
                        ),
                      )}
                    </div>
                  )}
                </section>
              )
            })}
          </div>
        </>
      )}
      {notes.length > 0 && (
        <details className="notes">
          <summary>{ui.roster.otherNotes(notes.length)}</summary>
          <ul>{notes.map((w, i) => line(w, w.text, `${w.code}-${w.date}-${i}`))}</ul>
        </details>
      )}
    </section>
  )
}
