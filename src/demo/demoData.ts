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
const ASSISTANTS = ['Rácz Réka', 'Sipos Szilvia']
const CIVILS = ['Szabó Sára', 'Tóth Tímea']

function people(names: string[], role: Staff['role'], leaveAllowance: number): Staff[] {
  return names.map((fullName, i) => ({
    id: `demo-${role}-${i + 1}`,
    fullName,
    displayName: fullName.split(' ')[1],
    role,
    active: true,
    leaveAllowance,
  }))
}

/**
 * A kindergarten of 20 (two asszisztens, two civils), three break groups, and a busy next break
 * week: a training day leaves teachers short on Tuesday, so an asszisztens takes a DU seat, and on
 * Thursday too few nannies are in, so a civil takes a nanny seat (v3-c). Everyone has a leave
 * allowance; two have days carried over.
 */
export function demoState(today: string): AppState {
  const week = defaultWeek(today)
  const days = periodForWeek(week).days
  const away = (staffId: string, dates: string[], kind: Absence['kind'] = 'leave'): Absence[] =>
    dates.map((date) => ({ staffId, date, kind }))
  return {
    ...emptyState(),
    demo: true,
    staff: [
      ...people(TEACHERS, 'teacher', 46),
      ...people(NANNIES, 'nanny', 25),
      ...people(ASSISTANTS, 'assistant', 25),
      ...people(CIVILS, 'civil', 20),
    ].map((s) =>
      s.id === 'demo-teacher-1'
        ? { ...s, leaveCarry: { [days[0].slice(0, 4)]: 3 } }
        : s.id === 'demo-nanny-1'
          ? { ...s, leaveCarry: { [days[0].slice(0, 4)]: 2 } }
          : s,
    ),
    absences: [
      ...away('demo-teacher-1', days),
      ...away('demo-teacher-3', days.slice(2, 4)),
      ...away('demo-teacher-7', days.slice(-1), 'sick'),
      ...away('demo-nanny-2', days.slice(0, 1)),
      // Tuesday: a training day for three teachers, one more sick.
      ...away('demo-teacher-2', days.slice(1, 2), 'sick'),
      ...['demo-teacher-4', 'demo-teacher-5', 'demo-teacher-6'].flatMap((id) =>
        away(id, days.slice(1, 2), 'other'),
      ),
      // Thursday: four nannies away.
      ...away('demo-nanny-1', days.slice(3, 4), 'sick'),
      ...['demo-nanny-3', 'demo-nanny-4', 'demo-nanny-5'].flatMap((id) =>
        away(id, days.slice(3, 4)),
      ),
      ...away('demo-assistant-2', days.slice(0, 1)),
      ...away('demo-civil-2', days.slice(-1), 'sick'),
    ],
    periods: { [week]: { dayPlans: days.map((date) => ({ date, requestedGroups: 3 })) } },
  }
}
