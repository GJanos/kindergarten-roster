import type { Balance, GapKind } from '../core/types'
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
