import { addDays } from '../core/calendar'

const pad = (n: number) => String(n).padStart(2, '0')

/** Today in the browser's time zone, as an ISO date. */
export function today(now = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000)
}

/** Every date of a month ('2026-10'). */
export function monthDays(month: string): string[] {
  const days: string[] = []
  for (let date = `${month}-01`; date.startsWith(month); date = addDays(date, 1)) days.push(date)
  return days
}

/** '2026-12' + 1 → '2027-01'. */
export function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split('-').map(Number)
  const index = y * 12 + (m - 1) + by
  return `${Math.floor(index / 12)}-${pad((index % 12) + 1)}`
}
