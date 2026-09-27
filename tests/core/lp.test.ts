import loadHighs from 'highs'
import { describe, expect, it } from 'vitest'
import { Lin, Milp, toLpText, toRow } from '../../src/core/lp'

const highs = await loadHighs()

describe('Lin', () => {
  it('adds terms and constants, with scaling', () => {
    const a = new Lin().add('x', 2).add('y').addConstant(3)
    const b = new Lin().plus(a, -2).add('x', 4)
    expect([...b.terms]).toEqual([
      ['x', 0],
      ['y', -2],
    ])
    expect(b.constant).toBe(-6)
    expect(b.isEmpty()).toBe(false)
    expect(new Lin().add('x', 1).add('x', -1).isEmpty()).toBe(true)
  })
})

describe('toRow', () => {
  it('moves everything to the left and drops zero coefficients', () => {
    const row = toRow(
      new Lin().add('x').add('z').addConstant(2),
      '>=',
      new Lin().add('y').add('z').addConstant(5),
    )
    expect([...row.terms]).toEqual([
      ['x', 1],
      ['y', -1],
    ])
    expect(row).toMatchObject({ op: '>=', rhs: 3 })
  })

  it('refuses a row without variables', () => {
    expect(() => toRow(Lin.constant(1), '<=', 2)).toThrow(/no variables/)
  })
})

describe('Milp and toLpText', () => {
  it('refuses a variable declared twice', () => {
    const milp = new Milp()
    milp.binary('x')
    expect(() => milp.nonNegative('x')).toThrow(/declared twice/)
  })

  it('writes CPLEX LP text', () => {
    const milp = new Milp()
    milp.binary('x')
    milp.binary('y')
    milp.constrain(Lin.sum(['x', 'y']), '>=', 1)
    expect(toLpText(milp, new Lin().add('x', 2).add('y', 3))).toBe(
      [
        'Minimize',
        ' obj: + 2 x + 3 y',
        'Subject To',
        ' r0: + 1 x + 1 y >= 1',
        'Binary',
        ' x y',
        'End',
      ].join('\n'),
    )
  })

  it('produces text HiGHS solves, including wrapped long rows and fractional bounds', () => {
    const milp = new Milp()
    const names = Array.from({ length: 30 }, (_, i) => milp.binary(`b${i}`))
    const slack = milp.nonNegative('slack')
    milp.constrain(Lin.sum(names), '>=', 3)
    milp.constrain(new Lin().add(slack), '>=', 0.5)
    const result = highs.solve(toLpText(milp, Lin.sum([...names, slack])), { output_flag: false })
    expect(result.Status).toBe('Optimal')
    expect(result.ObjectiveValue).toBeCloseTo(3.5)
  })
})
