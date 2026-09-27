import type { DayPlan, SolveInput, Staff } from '../src/core/types'

/** The hand-transcribed week: names as on her sheet, absences by name. */
export type SliceFile = {
  groups: number
  days: string[]
  overrides?: Record<string, number>
  staff: { name: string; role: 'teacher' | 'nanny' }[]
  absent?: Record<string, string[]>
}

export function sliceInput(file: SliceFile): SolveInput {
  const names = file.staff.map((s) => s.name)
  const duplicate = names.find((name, i) => names.indexOf(name) !== i)
  if (duplicate) throw new Error(`Duplicate name: ${duplicate}`)
  const staff: Staff[] = file.staff.map((s, i) => ({
    id: `s${i + 1}`,
    fullName: s.name,
    displayName: s.name,
    role: s.role,
    active: true,
  }))
  const idOf = new Map(staff.map((s) => [s.fullName, s.id]))
  const days = [...new Set(file.days)].sort()
  const absences = Object.entries(file.absent ?? {}).flatMap(([name, dates]) => {
    const staffId = idOf.get(name)
    if (!staffId) throw new Error(`Unknown name in "absent": ${name}`)
    return dates.map((date) => {
      if (!days.includes(date)) throw new Error(`${name}: ${date} is not one of the days`)
      return { staffId, date, kind: 'leave' as const }
    })
  })
  const dayPlans: DayPlan[] = days.map((date) => {
    const override = file.overrides?.[date]
    return override === undefined
      ? { date, requestedGroups: file.groups }
      : { date, requestedGroups: file.groups, override }
  })
  return { staff, absences, period: { start: days[0], days }, dayPlans }
}
