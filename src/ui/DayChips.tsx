import { seatShortage, zeroHoleNeeds, type DayCapacity } from '../core/capacity'
import { dayHeader, ui } from '../i18n/hu'
import { Info } from './Info'

/** Warns, never blocks: Számol always works. */
function dayStatus(c: DayCapacity): { ok: boolean; text: string } {
  if (c.closed) return { ok: true, text: ui.roster.closed }
  const needs = zeroHoleNeeds(c.groups)
  const short = seatShortage(c)
  const wanted = c.override ?? c.requested
  const notes: string[] = []
  // The count is capped at what the day can run: fewer groups than she asked for is a warning of
  // its own, and the one that catches no teacher at all (g_max 0).
  if (c.groups < wanted) notes.push(ui.roster.fewGroups(c.groups, wanted))
  if (short.teachers > 0)
    notes.push(ui.roster.fewTeachers(c.teachers, c.assistants, c.groups, needs.teachers))
  if (short.nannies > 0) notes.push(ui.roster.fewNannies(c.nannies, c.civils, needs.nannies))
  if (c.override !== undefined) notes.push(ui.roster.manual(c.groups))
  return {
    ok: notes.length === 0 || (notes.length === 1 && c.override !== undefined),
    text: notes.join(' · '),
  }
}

/**
 * One chip per day with its live capacity; clicking one opens the day editor. `from` is where a
 * week in progress starts: earlier days are history, their count no longer changes.
 */
export function DayChips(props: {
  capacities: DayCapacity[]
  onEdit: (date: string) => void
  from?: string
}) {
  return (
    <div className="capacity">
      {props.capacities.map((c) => {
        const status = dayStatus(c)
        const history = props.from !== undefined && c.date < props.from
        return (
          <button
            key={c.date}
            className={status.ok ? 'day ok' : 'day warn'}
            disabled={history}
            title={history ? ui.roster.historyDay : undefined}
            onClick={() => props.onEdit(c.date)}
          >
            <strong>{dayHeader(c.date)}</strong> {status.ok ? '✓' : '⚠'} {status.text}
          </button>
        )
      })}
      <Info text={ui.roster.daysHint} />
    </div>
  )
}
