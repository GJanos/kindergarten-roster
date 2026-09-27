import { usesFridayTimes } from './calendar'
import type { Role, Shift } from './types'

/** Fixed shift times (spec §2): never optimised, never stretched. */
export function shiftTimes(role: Role, shift: Shift, date: string): string {
  if (role === 'nanny') return shift === 'morning' ? '6:00–14:00' : '10:00–18:00'
  if (usesFridayTimes(date)) return shift === 'morning' ? '7:00–13:00' : '11:00–17:00'
  return shift === 'morning' ? '7:00–13:30' : '10:30–17:00'
}
