import loadHighs from 'highs'
import { describe, expect, it } from 'vitest'
import { defaultWeek } from '../../src/core/calendar'
import { TEST_META } from '../core/fixtures'
import { makeRoster } from '../../src/core/pipeline'
import { migrate } from '../../src/state/migrate'
import { solveInputFor } from '../../src/state/solveInput'
import { demoState } from '../../src/demo/demoData'

describe('demo data', () => {
  it('is valid app data that solves without holes', async () => {
    const state = migrate(demoState('2026-10-01'))
    expect(state.demo).toBe(true)
    const week = defaultWeek('2026-10-01')
    const result = makeRoster(solveInputFor(state, week), await loadHighs(), TEST_META)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.roster.holes).toEqual([])
  })
})
