import { SCHEMA_VERSION, type AppState } from './appState'

export class InvalidDataError extends Error {
  constructor(detail: string) {
    super(`Invalid app data: ${detail}`)
    this.name = 'InvalidDataError'
  }
}

type Json = Record<string, unknown>
const isObject = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isStaff = (value: unknown) =>
  isObject(value) &&
  typeof value.id === 'string' &&
  typeof value.fullName === 'string' &&
  typeof value.displayName === 'string' &&
  (value.role === 'teacher' || value.role === 'nanny') &&
  typeof value.active === 'boolean' &&
  (value.deleted === undefined || value.deleted === true)

const isAbsence = (value: unknown) =>
  isObject(value) && typeof value.staffId === 'string' && typeof value.date === 'string'

/**
 * Brings saved or backed-up data up to the current schema. Runs on every load and
 * every restore, so old backups open in any newer version. Add a step per version:
 * `if (data.schemaVersion === 1) data = fromV1(data)`.
 */
export function migrate(raw: unknown): AppState {
  if (!isObject(raw)) throw new InvalidDataError('not an object')
  const data = raw
  if (data.schemaVersion !== SCHEMA_VERSION) {
    throw new InvalidDataError(`unknown schema version ${String(data.schemaVersion)}`)
  }
  if (!Array.isArray(data.staff) || !data.staff.every(isStaff)) throw new InvalidDataError('staff')
  if (!Array.isArray(data.absences) || !data.absences.every(isAbsence))
    throw new InvalidDataError('absences')
  if (!isObject(data.periods)) throw new InvalidDataError('periods')
  return data as AppState
}
