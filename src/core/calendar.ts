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
