import { defaultWeek, periodForWeek } from '../core/calendar'
import type { Absence, Staff } from '../core/types'
import { emptyState, type AppState } from '../state/appState'

// Invented people for the public demo — not anonymised real staff (spec §14).
const TEACHERS = [
  'Almási Anna',
  'Bodnár Bea',
  'Csányi Cili',
  'Deák Dalma',
  'Erdős Emese',
  'Fazekas Flóra',
  'Gál Gréta',
  'Hegedűs Hanna',
  'Illés Irén',
  'Jakab Jolán',
]
const NANNIES = [
  'Kerekes Kati',
  'Lengyel Laura',
  'Mészáros Melinda',
  'Nagy Nóra',
  'Orbán Olga',
  'Pintér Piroska',
]

function people(names: string[], role: Staff['role']): Staff[] {
  return names.map((fullName, i) => ({
    id: `demo-${role}-${i + 1}`,
    fullName,
    displayName: fullName.split(' ')[1],
    role,
    active: true,
  }))
}

/** A kindergarten of 16, three break groups, a few absences in the next break week. */
export function demoState(today: string): AppState {
  const week = defaultWeek(today)
  const days = periodForWeek(week).days
  const away = (staffId: string, dates: string[]): Absence[] =>
    dates.map((date) => ({ staffId, date }))
  return {
    ...emptyState(),
    demo: true,
    staff: [...people(TEACHERS, 'teacher'), ...people(NANNIES, 'nanny')],
    absences: [
      ...away('demo-teacher-1', days),
      ...away('demo-teacher-3', days.slice(2, 4)),
      ...away('demo-teacher-7', days.slice(-1)),
      ...away('demo-nanny-2', days.slice(0, 1)),
    ],
    periods: { [week]: { dayPlans: days.map((date) => ({ date, requestedGroups: 3 })) } },
  }
}
