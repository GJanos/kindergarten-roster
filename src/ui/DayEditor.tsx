import type { DayPlan } from '../core/types'
import { capitalize, dayHeader, ui } from '../i18n/hu'

type Props = {
  plan: DayPlan
  /** A number sets the day's own group count (0 = closed); undefined follows the week again. */
  onOverride: (groups?: number) => void
  onDone: () => void
}

/** One day's group count, when it differs from the rest of the week. */
export function DayEditor({ plan, onOverride, onDone }: Props) {
  const current = plan.override ?? plan.requestedGroups
  return (
    <div className="day-editor">
      <strong>{capitalize(dayHeader(plan.date))}</strong> {ui.roster.dayGroups}
      <button onClick={() => onOverride(Math.max(0, current - 1))}>−</button>
      <strong>{current}</strong>
      <button onClick={() => onOverride(current + 1)}>+</button>
      <button onClick={() => onOverride(0)}>{ui.roster.closeDay}</button>
      <button onClick={() => onOverride(undefined)}>{ui.roster.resetDay}</button>
      <button onClick={onDone}>{ui.roster.done}</button>
    </div>
  )
}
