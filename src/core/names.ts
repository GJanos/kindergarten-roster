import type { Staff } from './types'

const OPEN = ''
const CLOSE = ''
const REFERENCE = /([^]*)/g

/**
 * A person inside a warning text, written as a reference (private-use characters nobody types)
 * and resolved on display, so a later rename reaches rosters saved before it.
 */
export function nameRef(staffId: string): string {
  return `${OPEN}${staffId}${CLOSE}`
}

/** Each reference in `text` → that person's current display name; '?' if they are gone. */
export function resolveNames(text: string, staff: Staff[]): string {
  if (!text.includes(OPEN)) return text
  const names = new Map(staff.map((s) => [s.id, s.displayName]))
  return text.replace(REFERENCE, (_, id: string) => names.get(id) ?? '?')
}
