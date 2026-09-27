import { existsSync, readFileSync } from 'node:fs'
import loadHighs from 'highs'
import { describe, expect, it } from 'vitest'
import { TEST_META } from '../core/fixtures'
import { makeRoster } from '../../src/core/pipeline'
import { sliceInput, type SliceFile } from '../../scripts/slice-input'

// Her real Aug 24–28 week (spec §11.4). data/ is gitignored, so this runs only where the data is.
// A stage that hits its time limit on a slow machine can change the roster: re-run before updating.
const WEEK = 'data/aug24.json'

describe.skipIf(!existsSync(WEEK))('golden period', () => {
  it('still gives the roster she approved', async () => {
    const input = sliceInput(JSON.parse(readFileSync(WEEK, 'utf8')) as SliceFile)
    const result = makeRoster(input, await loadHighs(), TEST_META)
    expect(result.ok).toBe(true)
    await expect(JSON.stringify(result, null, 2)).toMatchFileSnapshot(
      '../../data/aug24.snapshot.json',
    )
  })
})
