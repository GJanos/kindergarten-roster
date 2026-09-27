import { addDays } from '../core/calendar'
import { formatDate, formatPeriod, ui } from '../i18n/hu'

type Props = {
  week: string
  days: string[]
  hasRoster: (monday: string) => boolean
  onWeek: (week: string) => void
  /** Absent for a week that is over: its group count is history. */
  groups?: { count: number; onChange: (count: number) => void }
  archived: boolean
  edited: boolean
}

/** ◀ the week ▶, a dot where a roster is saved, and the week's group count. */
export function WeekBar({ week, days, hasRoster, onWeek, groups, archived, edited }: Props) {
  return (
    <div className="bar">
      <button aria-label={ui.roster.previousWeek} onClick={() => onWeek(addDays(week, -7))}>
        ◀{hasRoster(addDays(week, -7)) && ' •'}
      </button>
      <h2>
        {days.length > 0 ? formatPeriod(days) : formatDate(week)}
        {hasRoster(week) && (
          <span className="dot" title={ui.roster.saved}>
            {' '}
            •
          </span>
        )}
        {archived && <span className="archived-badge">{ui.roster.archivedBadge}</span>}
        {edited && <span className="edited-badge">{ui.roster.editedBadge}</span>}
      </h2>
      <button aria-label={ui.roster.nextWeek} onClick={() => onWeek(addDays(week, 7))}>
        {hasRoster(addDays(week, 7)) && '• '}▶
      </button>
      {groups && (
        <span className="groups">
          {ui.roster.groups}
          <button onClick={() => groups.onChange(Math.max(1, groups.count - 1))}>−</button>
          <strong>{groups.count}</strong>
          <button onClick={() => groups.onChange(groups.count + 1)}>+</button>
        </span>
      )}
    </div>
  )
}
