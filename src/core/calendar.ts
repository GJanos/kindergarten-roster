import type { Period } from './types'

const DAY_MS = 86_400_000

function toUtcMs(date: string): number {
  return Date.parse(`${date}T00:00:00Z`)
}

/** `date` moved by `days` calendar days. ISO dates in UTC, so time zones never shift a day. */
export function addDays(date: string, days: number): string {
  return new Date(toUtcMs(date) + days * DAY_MS).toISOString().slice(0, 10)
}

/** 0 = Sunday … 6 = Saturday. */
export function weekday(date: string): number {
  return new Date(toUtcMs(date)).getUTCDay()
}

// ── Hungarian calendar, updated yearly by a push ─────────────────────────────
// Sources: Mt. 102. § (public holidays); NGM rest-day decree for 2026
// (Jan 2, Aug 21, Dec 24 off; Jan 10, Aug 8, Dec 12 worked); tanév rendje 2026/2027.
// The 2027 rest-day decree is due by 2026-10-31: add its days here when it appears.

/** Weekday rest days: public holidays and bridge days. Weekends need not be listed. */
export const HOLIDAYS: ReadonlySet<string> = new Set([
  '2026-01-01',
  '2026-01-02',
  '2026-04-03',
  '2026-04-06',
  '2026-05-01',
  '2026-05-25',
  '2026-08-20',
  '2026-08-21',
  '2026-10-23',
  '2026-12-24',
  '2026-12-25',
  '2027-01-01',
  '2027-03-15',
  '2027-03-26',
  '2027-03-29',
  '2027-05-17',
  '2027-08-20',
])

/** Saturdays worked in exchange for a bridge day. They use the Friday shift times. */
export const WORKING_SATURDAYS: ReadonlySet<string> = new Set([
  '2026-01-10',
  '2026-08-08',
  '2026-12-12',
])

/** School breaks, inclusive: the weeks she builds a roster for. */
export const SCHOOL_BREAKS: readonly { from: string; to: string }[] = [
  { from: '2026-10-23', to: '2026-11-01' },
  { from: '2026-12-19', to: '2027-01-03' },
  { from: '2027-03-25', to: '2027-04-04' },
  { from: '2027-06-19', to: '2027-08-31' },
]

export function isWorkingDay(date: string): boolean {
  if (WORKING_SATURDAYS.has(date)) return true
  const day = weekday(date)
  return day >= 1 && day <= 5 && !HOLIDAYS.has(date)
}

/** Friday times apply on Fridays and on working Saturdays. */
export function usesFridayTimes(date: string): boolean {
  return weekday(date) === 5 || weekday(date) === 6
}

/** The Monday of the week that contains `date`. */
export function mondayOf(date: string): string {
  return addDays(date, -((weekday(date) + 6) % 7))
}

/** The working days of the week starting on `monday`, Saturday included. */
export function periodForWeek(monday: string): Period {
  const days = Array.from({ length: 6 }, (_, i) => addDays(monday, i)).filter(isWorkingDay)
  return { start: monday, days }
}

export function isBreakDay(date: string): boolean {
  return SCHOOL_BREAKS.some((b) => date >= b.from && date <= b.to)
}

/** The week the roster screen opens on: the next week with a break working day, else next week. */
export function defaultWeek(today: string): string {
  for (let i = 0; i < 53; i++) {
    const monday = addDays(mondayOf(today), 7 * i)
    const days = periodForWeek(monday).days.filter((d) => d >= today)
    if (days.some(isBreakDay)) return monday
  }
  return addDays(mondayOf(today), 7)
}
