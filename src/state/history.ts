import type { Balance, GapKind, Shift } from '../core/types'
import type { AppState } from './appState'

/** Sep 1 of the kindergarten year `date` falls in (the year her balance resets). */
export function yearStart(date: string): string {
  const year = Number(date.slice(0, 4))
  return date.slice(5) >= '09-01' ? `${year}-09-01` : `${year - 1}-09-01`
}

/** Adds one roster's balance into a running total. */
function addInto(total: Balance, balance: Balance): void {
  for (const [staffId, kinds] of Object.entries(balance)) {
    const mine = (total[staffId] ??= {})
    for (const [kind, delta] of Object.entries(kinds) as [GapKind, number][]) {
      mine[kind] = (mine[kind] ?? 0) + delta
    }
  }
}

/**
 * The kindergarten year before `week` (a Monday): the stored deltas of every earlier roster of
 * that year, summed. Rosters saved before v2 carry none and add nothing.
 */
export function yearlyHistory(state: AppState, week: string): Balance {
  const from = yearStart(week)
  const total: Balance = {}
  for (const [monday, period] of Object.entries(state.periods)) {
    if (monday < from || monday >= week || !period.roster?.balance) continue
    addInto(total, period.roster.balance)
  }
  return total
}

export type YearCounts = Record<Shift | Exclude<GapKind, 'morning'>, number>
export type YearRow = { staffId: string; counts: YearCounts; deltas: Balance[string] }

/**
 * Each person's kindergarten year up to this week: days worked per shift, openings, closings and
 * reserve days, counted from the saved rosters, plus their summed deltas. Teachers first. Every
 * active person has a row, zeros until their first saved day.
 */
export function yearTotals(state: AppState, today: string): YearRow[] {
  const from = yearStart(today)
  const rows = new Map<string, YearRow>()
  const rowOf = (staffId: string): YearRow => {
    let row = rows.get(staffId)
    if (!row) {
      row = {
        staffId,
        counts: { morning: 0, afternoon: 0, opener: 0, closer: 0, reserve: 0 },
        deltas: {},
      }
      rows.set(staffId, row)
    }
    return row
  }
  const deltas: Balance = {}
  for (const [monday, period] of Object.entries(state.periods)) {
    if (monday < from || monday > today || !period.roster) continue
    for (const a of period.roster.assignments) {
      const { counts } = rowOf(a.staffId)
      counts[a.shift]++
      if (a.opener) counts.opener++
      if (a.closer) counts.closer++
      if (!a.seat) counts.reserve++
    }
    if (period.roster.balance) addInto(deltas, period.roster.balance)
  }
  for (const [staffId, mine] of Object.entries(deltas)) rowOf(staffId).deltas = mine
  return state.staff
    .filter((s) => !s.deleted && (s.active || rows.has(s.id)))
    .sort((a, b) => (a.role === b.role ? 0 : a.role === 'teacher' ? -1 : 1))
    .map((s) => rowOf(s.id))
}
