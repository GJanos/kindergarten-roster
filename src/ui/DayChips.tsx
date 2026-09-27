import { zeroHoleNeeds, type DayCapacity } from '../core/capacity'
import { dayHeader, ui } from '../i18n/hu'
import { Info } from './Info'

/** Warns, never blocks: Számol always works. */
function dayStatus(c: DayCapacity): { ok: boolean; text: string } {
  if (c.closed) return { ok: true, text: ui.roster.closed }
  const needs = zeroHoleNeeds(c.groups)
  const notes: string[] = []
  if (c.teachers < needs.teachers)
    notes.push(ui.roster.fewTeachers(c.teachers, c.groups, needs.teachers))
  if (c.nannies < needs.nannies) notes.push(ui.roster.fewNannies(c.nannies, needs.nannies))
  if (c.override !== undefined) notes.push(ui.roster.manual(c.groups))
  return {
    ok: notes.length === 0 || (notes.length === 1 && c.override !== undefined),
    text: notes.join(' · '),
  }
}

/** One chip per day with its live capacity; clicking one opens the day editor. */
export function DayChips(props: { capacities: DayCapacity[]; onEdit: (date: string) => void }) {
  return (
    <div className="capacity">
      {props.capacities.map((c) => {
        const status = dayStatus(c)
        return (
          <button
            key={c.date}
            className={status.ok ? 'day ok' : 'day warn'}
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
