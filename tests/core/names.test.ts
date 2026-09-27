import { describe, expect, it } from 'vitest'
import { makeStaff } from './fixtures'
import { nameRef, resolveNames } from '../../src/core/names'

const staff = makeStaff(2, 1) // t1, t2, n1 — display names T1, T2, N1

describe('name references', () => {
  it('resolve to the current display name', () => {
    expect(resolveNames(`Szerda, 1. cs.: dajka helyett óvónő — ${nameRef('t2')}.`, staff)).toBe(
      'Szerda, 1. cs.: dajka helyett óvónő — T2.',
    )
  })

  it('resolve several in one text', () => {
    expect(
      resolveNames(`Hívj be valakit: ${nameRef('t1')}, ${nameRef('n1')} (távol).`, staff),
    ).toBe('Hívj be valakit: T1, N1 (távol).')
  })

  it('show ? for someone no longer on the list', () => {
    expect(resolveNames(`${nameRef('gone')} keddtől a 2. csoportban.`, staff)).toBe(
      '? keddtől a 2. csoportban.',
    )
  })

  it('leave a text without references, like one saved before v2, as it is', () => {
    expect(resolveNames('Nóra kedden 18:00-ig, szerdán 6:00-tól.', staff)).toBe(
      'Nóra kedden 18:00-ig, szerdán 6:00-tól.',
    )
  })

  it('wrap the id in two private-use characters that never reach the screen', () => {
    expect(nameRef('t1')).toBe('t1')
    expect(resolveNames(nameRef('t1'), staff)).not.toMatch(/[]/)
  })
})
