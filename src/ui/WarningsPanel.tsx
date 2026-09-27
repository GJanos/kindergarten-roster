import { resolveNames } from '../core/names'
import type { SolveInput, Staff, Warning } from '../core/types'
import { dayHeader, ui } from '../i18n/hu'
import { Info } from './Info'
import { shownWarningCount, warningDays, type DayFix } from './warningDays'

type Props = {
  warnings: Warning[]
  input: SolveInput
  staff: Staff[] // everyone, hidden people included, so old rosters resolve
  onHover: (warning?: Warning) => void
  onFix?: (fix: DayFix) => void // absent for an archived week: history has no fixes
}

/** Above the result, one card per day; hovering a line highlights its cells. */
export function WarningsPanel({ warnings, input, staff, onHover, onFix }: Props) {
  const { days, notes } = warningDays(warnings, input)
  const shown = (text: string) => resolveNames(text, staff)
  const line = (w: Warning, text: string, key: string) => (
    <li
      key={key}
      className={`warning ${w.severity}`}
      onMouseEnter={() => onHover(w)}
      onMouseLeave={() => onHover(undefined)}
    >
      {shown(text)}
    </li>
  )

  return (
    <section className="warnings">
      {days.length === 0 ? (
        <p className="all-good">✓ {ui.roster.allGood}</p>
      ) : (
        <>
          <h3>
            {ui.roster.warnings} ({shownWarningCount(warnings)}){' '}
            <Info text={ui.roster.warningsHint} />
          </h3>
          {/* One column per day, so a lone card keeps its size and its day's place. */}
          <div
            className="warning-days"
            style={{
              gridTemplateColumns: `repeat(${input.period.days.length}, minmax(170px, 1fr))`,
            }}
          >
            {days.map((day) => {
              const headingId = `warnings-${day.date}`
              return (
                <section
                  key={day.date}
                  className={day.holes > 0 ? 'warning-day red' : 'warning-day orange'}
                  style={{ gridColumn: input.period.days.indexOf(day.date) + 1 }}
                  aria-labelledby={headingId}
                >
                  <h4 id={headingId}>
                    {dayHeader(day.date)}
                    {day.holes > 0 && <span className="count">{ui.roster.holes(day.holes)}</span>}
                  </h4>
                  <ul>{day.items.map((w, i) => line(w, day.texts[i], `${w.code}-${i}`))}</ul>
                  {onFix &&
                    day.actions.map((action) => (
                      <p key={action} className="action">
                        {shown(action)}
                      </p>
                    ))}
                  {onFix && day.fixes.length > 0 && (
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
                            {ui.roster.callIn(fix.name, fix.sick)}
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
