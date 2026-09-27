import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { sliceInput, type SliceFile } from '../../scripts/slice-input'

const file: SliceFile = {
  groups: 2,
  days: ['2026-08-25', '2026-08-24'],
  overrides: { '2026-08-25': 1 },
  staff: [
    { name: 'Anna', role: 'teacher' },
    { name: 'Kati', role: 'nanny' },
  ],
  absent: { Kati: ['2026-08-24'] },
}

describe('sliceInput', () => {
  it('turns the transcribed week into a solve input', () => {
    expect(sliceInput(file)).toEqual({
      staff: [
        { id: 's1', fullName: 'Anna', displayName: 'Anna', role: 'teacher', active: true },
        { id: 's2', fullName: 'Kati', displayName: 'Kati', role: 'nanny', active: true },
      ],
      absences: [{ staffId: 's2', date: '2026-08-24' }],
      period: { start: '2026-08-24', days: ['2026-08-24', '2026-08-25'] },
      dayPlans: [
        { date: '2026-08-24', requestedGroups: 2 },
        { date: '2026-08-25', requestedGroups: 2, override: 1 },
      ],
    })
  })

  it('rejects duplicate names, unknown names and stray dates', () => {
    expect(() =>
      sliceInput({ ...file, staff: [...file.staff, { name: 'Anna', role: 'nanny' }] }),
    ).toThrow(/Duplicate/)
    expect(() => sliceInput({ ...file, absent: { Zoé: ['2026-08-24'] } })).toThrow(/Unknown name/)
    expect(() => sliceInput({ ...file, absent: { Kati: ['2026-08-31'] } })).toThrow(
      /not one of the days/,
    )
  })

  it('reads the committed example', () => {
    const example = JSON.parse(readFileSync('scripts/slice-example.json', 'utf8')) as SliceFile
    expect(sliceInput(example).staff).toHaveLength(13)
  })
})
