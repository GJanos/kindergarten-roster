import { usesFridayTimes } from './calendar'
import type { Role, Shift } from './types'

/**
 * Fixed shift times (spec §2): never optimised, never stretched. Ügyelet (v3-b) moves a teacher's
 * shift 30 minutes — the morning one earlier, the afternoon one later — at the same length.
 */
export function shiftTimes(role: Role, shift: Shift, date: string, duty = false): string {
  if (role === 'nanny') return shift === 'morning' ? '6:00–14:00' : '10:00–18:00'
  const friday = usesFridayTimes(date)
  if (duty) {
    if (shift === 'morning') return friday ? '6:30–12:30' : '6:30–13:00'
    return friday ? '11:30–17:30' : '11:00–17:30'
  }
  if (friday) return shift === 'morning' ? '7:00–13:00' : '11:00–17:00'
  return shift === 'morning' ? '7:00–13:30' : '10:30–17:00'
}
