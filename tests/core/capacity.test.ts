import { describe, expect, it } from 'vitest'
import {
  cover,
  dayCapacities,
  expectedHoles,
  gMax,
  groupsWithoutTeacherHoles,
  zeroHoleNeeds,
} from '../../src/core/capacity'
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

describe('shortage helpers', () => {
  it('knows what a day needs for zero holes', () => {
    expect(zeroHoleNeeds(0)).toEqual({ teachers: 0, nannies: 2 })
    expect(zeroHoleNeeds(1)).toEqual({ teachers: 2, nannies: 2 })
    expect(zeroHoleNeeds(3)).toEqual({ teachers: 6, nannies: 3 })
  })

  it('suggests the largest group count with every teacher seat filled', () => {
    const day = (teachers: number, nannies: number, groups: number, assistants = 0) => ({
      teachers,
      nannies,
      assistants,
      civils: 0,
      groups,
    })
    expect(groupsWithoutTeacherHoles(day(3, 2, 2))).toBe(1)
    expect(groupsWithoutTeacherHoles(day(5, 1, 3))).toBe(2)
    expect(groupsWithoutTeacherHoles(day(1, 3, 2))).toBeUndefined()
    // An asszisztens fills a DU seat: 3 teachers and her cover 2 groups.
    expect(groupsWithoutTeacherHoles(day(3, 3, 3, 1))).toBe(2)
  })
})

describe('expectedHoles', () => {
  const day = (teachers: number, nannies: number, groups: number) =>
    dayCapacities(makeInput({ teachers, nannies, groups, days: [D] }))[0]

  it('is zero for a fully staffed day', () => {
    expect(expectedHoles(day(4, 2, 2))).toBe(0)
  })

  it('counts empty teacher seats, and the ügyelet once no group has both teachers', () => {
    expect(expectedHoles(day(3, 2, 2))).toBe(1) // one seat; group 1 still has both teachers
    expect(expectedHoles(day(2, 2, 2))).toBe(3) // two seats and the ügyelet
  })

  it('counts the keys a lone nanny cannot hold', () => {
    expect(expectedHoles(day(2, 1, 1))).toBe(1)
  })

  it('says a day without teachers is one problem', () => {
    expect(expectedHoles(day(0, 2, 2))).toBe(1)
  })

  it('has nothing on a closed day', () => {
    const closed = dayCapacities({
      ...makeInput({ teachers: 4, nannies: 2, groups: 2, days: [D] }),
      dayPlans: [{ date: D, requestedGroups: 2, override: 0 }],
    })[0]
    expect(expectedHoles(closed)).toBe(0)
  })
})

describe('helpers in the headcount (v3-c)', () => {
  it('counts civils with the nannies for g_max, never as teachers', () => {
    expect(gMax(4, 0, 2)).toBe(3)
    expect(gMax(2, 0, 4)).toBe(2)
  })

  it('counts the asszisztens and civils present', () => {
    const input = makeInput({
      teachers: 2,
      nannies: 1,
      assistants: 1,
      civils: 2,
      groups: 2,
      days: [D],
      absent: { c2: [D] },
    })
    expect(dayCapacities(input)[0]).toMatchObject({
      teachers: 2,
      nannies: 1,
      assistants: 1,
      civils: 1,
      gMax: 2,
      groups: 2,
    })
  })

  it('lets an asszisztens cover a DU teacher seat, a civil a nanny seat', () => {
    expect(cover({ teachers: 3, nannies: 1, assistants: 1, civils: 2 })).toEqual({
      teachers: 4,
      nannies: 3,
    })
  })
})

describe('expectedHoles with helpers (v3-c)', () => {
  const day = (
    spec: { teachers: number; nannies: number; groups: number } & Partial<
      Record<'assistants' | 'civils', number>
    >,
  ) => dayCapacities(makeInput({ ...spec, days: [D] }))[0]

  it('fills a missing DU teacher with an asszisztens, and the ügyelet with her', () => {
    expect(expectedHoles(day({ teachers: 3, nannies: 2, assistants: 1, groups: 2 }))).toBe(0)
    // Two seats short, one asszisztens: one seat stays empty; her group can be on duty.
    expect(expectedHoles(day({ teachers: 2, nannies: 2, assistants: 1, groups: 2 }))).toBe(1)
  })

  it('seats civils as nannies before any teacher, and lets them hold the keys', () => {
    expect(expectedHoles(day({ teachers: 4, nannies: 0, civils: 2, groups: 2 }))).toBe(0)
  })

  it('gives a civil no key while the nannies fill every seat', () => {
    expect(expectedHoles(day({ teachers: 2, nannies: 1, civils: 1, groups: 1 }))).toBe(1)
  })
})
