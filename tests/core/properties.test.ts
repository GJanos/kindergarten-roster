import loadHighs from 'highs'
import { describe, expect, it } from 'vitest'
import { dayCapacities, zeroHoleNeeds } from '../../src/core/capacity'
import { TEST_META, randomInput } from './fixtures'
import { makeRoster } from '../../src/core/pipeline'
import type { Hole, WarningCode } from '../../src/core/types'

const highs = await loadHighs()
// PROPERTY_RUNS=300 npm test -- properties   for a deep run before a release.
const RUNS = Number(process.env.PROPERTY_RUNS ?? 25)

const warningFor: Record<Hole['kind'], WarningCode> = {
  teacherSeat: 'TEACHER_SEAT_EMPTY',
  opener: 'OPENER_MISSING',
  closer: 'CLOSER_MISSING',
}

describe('every random period', () => {
  for (let seed = 1; seed <= RUNS; seed++) {
    it(`seed ${seed}`, () => {
      const input = randomInput(seed)
      const result = makeRoster(input, highs, TEST_META)
      expect(result.ok ? [] : result.violations).toEqual([])
      if (!result.ok) return
      const { roster } = result
      const capacities = dayCapacities(input)

      const enoughStaff = capacities.every((c) => {
        const needs = zeroHoleNeeds(c.groups)
        return c.closed || (c.teachers >= needs.teachers && c.nannies >= needs.nannies)
      })
      if (enoughStaff) expect(roster.holes).toEqual([])

      for (const hole of roster.holes) {
        expect(
          roster.warnings.some((w) => w.date === hole.date && w.code === warningFor[hole.kind]),
        ).toBe(true)
      }
      for (const c of capacities) {
        if (c.closed || c.groups >= (c.override ?? c.requested)) continue
        const flagged = roster.warnings.some(
          (w) => w.date === c.date && (w.code === 'GROUPS_REDUCED' || w.code === 'NO_TEACHER'),
        )
        expect(flagged).toBe(true)
      }
    })
  }
})
