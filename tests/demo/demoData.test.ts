import loadHighs from 'highs'
import { describe, expect, it } from 'vitest'
import { defaultWeek } from '../../src/core/calendar'
import { TEST_META } from '../core/fixtures'
import { makeRoster } from '../../src/core/pipeline'
import { migrate } from '../../src/state/migrate'
import { solveInputFor } from '../../src/state/solveInput'
import { demoState } from '../../src/demo/demoData'
import { isHelper } from '../../src/core/types'

describe('demo data', () => {
  it('is valid app data that solves without holes', async () => {
    const state = migrate(demoState('2026-10-01'))
    expect(state.demo).toBe(true)
    const week = defaultWeek('2026-10-01')
    const result = makeRoster(solveInputFor(state, week), await loadHighs(), TEST_META)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.roster.holes).toEqual([])
  })

  it('shows the helpers at work: both kinds stand in, and they have absences too (v3-c)', async () => {
    const state = migrate(demoState('2026-10-01'))
    const roleOf = (id: string) => state.staff.find((s) => s.id === id)!.role
    expect(state.staff.filter((s) => s.role === 'assistant')).toHaveLength(2)
    expect(state.staff.filter((s) => s.role === 'civil')).toHaveLength(2)
    expect(state.absences.some((a) => isHelper(roleOf(a.staffId)))).toBe(true)
    // Leave left shows for everyone, and someone has days carried over.
    expect(state.staff.every((s) => s.leaveAllowance !== undefined)).toBe(true)
    expect(state.staff.some((s) => s.leaveCarry !== undefined)).toBe(true)
    const week = defaultWeek('2026-10-01')
    const result = makeRoster(solveInputFor(state, week), await loadHighs(), TEST_META)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const standIns = result.roster.assignments.filter((a) => a.substitution)
    expect(standIns.some((a) => roleOf(a.staffId) === 'assistant' && a.shift === 'afternoon')).toBe(
      true,
    )
    expect(standIns.some((a) => roleOf(a.staffId) === 'civil' && a.seat?.kind === 'nanny')).toBe(
      true,
    )
  })
})
