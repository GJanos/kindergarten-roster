import { describe, expect, it } from 'vitest'
import { dayCapacities, gMax } from './capacity'
import { makeInput } from './fixtures'

const D = '2026-10-26'

describe('gMax', () => {
  it.each([
    [0, 5, 0],
    [1, 0, 0],
    [1, 1, 1],
    [2, 0, 1],
    [3, 1, 2],
    [4, 0, 2],
    [4, 4, 4],
    [5, 1, 3],
    [6, 2, 4],
    [10, 6, 8],
  ])('%i teachers and %i nannies can start %i groups', (teachers, nannies, groups) => {
    expect(gMax(teachers, nannies)).toBe(groups)
  })
})

describe('dayCapacities', () => {
  it('counts the active staff present', () => {
    const input = makeInput({ teachers: 4, nannies: 3, groups: 2, days: [D], absent: { t1: [D] } })
    input.staff[1].active = false // t2
    const [day] = dayCapacities(input)
    expect(day).toMatchObject({
      date: D,
      teachers: 2,
      nannies: 3,
      requested: 2,
      gMax: 2,
      groups: 2,
      closed: false,
    })
  })

  it('caps the request at what the day can start', () => {
    const [day] = dayCapacities(makeInput({ teachers: 3, nannies: 1, groups: 3, days: [D] }))
    expect(day.groups).toBe(2)
  })

  it('lets an override replace the request, capped the same way', () => {
    const lower = makeInput({
      teachers: 6,
      nannies: 3,
      groups: 3,
      days: [D],
      overrides: { [D]: 1 },
    })
    expect(dayCapacities(lower)[0].groups).toBe(1)
    const higher = makeInput({
      teachers: 3,
      nannies: 1,
      groups: 1,
      days: [D],
      overrides: { [D]: 4 },
    })
    expect(dayCapacities(higher)[0].groups).toBe(2)
  })

  it('closes a day set to 0 groups', () => {
    const [day] = dayCapacities(
      makeInput({ teachers: 4, nannies: 2, groups: 2, days: [D], overrides: { [D]: 0 } }),
    )
    expect(day).toMatchObject({ groups: 0, closed: true })
  })

  it('needs a plan for every day', () => {
    const input = makeInput({ teachers: 2, nannies: 2, groups: 1, days: [D] })
    input.dayPlans = []
    expect(() => dayCapacities(input)).toThrow(/No day plan/)
  })
})
