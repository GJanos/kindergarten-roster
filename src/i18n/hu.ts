import { weekday } from '../core/calendar'
import type { Shift } from '../core/types'

/** Every Hungarian string the app shows lives in this file. */

type DayForms = { name: string; on: string; from: string }

const DAYS: DayForms[] = [
  { name: 'vasárnap', on: 'vasárnap', from: 'vasárnaptól' },
  { name: 'hétfő', on: 'hétfőn', from: 'hétfőtől' },
  { name: 'kedd', on: 'kedden', from: 'keddtől' },
  { name: 'szerda', on: 'szerdán', from: 'szerdától' },
  { name: 'csütörtök', on: 'csütörtökön', from: 'csütörtöktől' },
  { name: 'péntek', on: 'pénteken', from: 'péntektől' },
  { name: 'szombat', on: 'szombaton', from: 'szombattól' },
]

const MONTHS = [
  'január',
  'február',
  'március',
  'április',
  'május',
  'június',
  'július',
  'augusztus',
  'szeptember',
  'október',
  'november',
  'december',
]

export const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

/** 'szerda' */
export const dayName = (date: string) => DAYS[weekday(date)].name
/** 'szerdán' */
export const onDay = (date: string) => DAYS[weekday(date)].on
/** 'szerdától' */
export const fromDay = (date: string) => DAYS[weekday(date)].from

function parts(date: string): [number, number, number] {
  const [y, m, d] = date.split('-').map(Number)
  return [y, m, d]
}

/** Column header: 'Szerda 10.28.' */
export function dayHeader(date: string): string {
  const [, month, day] = date.split('-')
  return `${capitalize(dayName(date))} ${month}.${day}.`
}

/** '2026. október 26.' */
export function formatDate(date: string): string {
  const [y, m, d] = parts(date)
  return `${y}. ${MONTHS[m - 1]} ${d}.`
}

/** '2026. október 26 – 30.', '2026. október 29 – november 2.', '2026. december 28. – 2027. január 1.' */
export function formatPeriod(days: string[]): string {
  if (days.length === 0) return ''
  if (days.length === 1) return formatDate(days[0])
  const [y1, m1, d1] = parts(days[0])
  const [y2, m2, d2] = parts(days[days.length - 1])
  if (y1 !== y2) return `${formatDate(days[0])} – ${formatDate(days[days.length - 1])}`
  if (m1 !== m2) return `${y1}. ${MONTHS[m1 - 1]} ${d1} – ${MONTHS[m2 - 1]} ${d2}.`
  return `${y1}. ${MONTHS[m1 - 1]} ${d1} – ${d2}.`
}

export const groupName = (group: number) => `${group}. csoport`
export const groupShort = (group: number) => `${group}. cs.`
export const shiftShort: Record<Shift, string> = { morning: 'DE', afternoon: 'DU' }

export const HOLE = 'BETÖLTETLEN'

export const LEGEND = [
  'DE = délelőtt, DU = délután. Félkövér: nyit (6:00) vagy zár (18:00).',
  'Óvónő: DE 7:00–13:30, DU 10:30–17:00; pénteken és ledolgozós szombaton DE 7:00–13:00, DU 11:00–17:00.',
  'Dajka: DE 6:00–14:00, DU 10:00–18:00.',
]
