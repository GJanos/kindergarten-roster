/** A tiny sparse linear-model builder and CPLEX LP writer for HiGHS. */

export type Op = '<=' | '>=' | '='
export type Row = { terms: Map<string, number>; op: Op; rhs: number }

/** A linear expression Σ coef·variable + constant. Mutable and chainable. */
export class Lin {
  readonly terms = new Map<string, number>()
  constant = 0

  static sum(variables: Iterable<string>): Lin {
    const lin = new Lin()
    for (const variable of variables) lin.add(variable)
    return lin
  }

  static constant(value: number): Lin {
    return new Lin().addConstant(value)
  }

  add(variable: string, coef = 1): this {
    this.terms.set(variable, (this.terms.get(variable) ?? 0) + coef)
    return this
  }

  plus(other: Lin, scale = 1): this {
    for (const [variable, coef] of other.terms) this.add(variable, coef * scale)
    this.constant += other.constant * scale
    return this
  }

  addConstant(value: number): this {
    this.constant += value
    return this
  }

  isEmpty(): boolean {
    return [...this.terms.values()].every((coef) => coef === 0)
  }
}

/** Variables and constraints of a model; each solve supplies its own objective. */
export class Milp {
  readonly binaries: string[] = []
  readonly continuous: string[] = []
  readonly rows: Row[] = []
  private readonly declared = new Set<string>()

  binary(name: string): string {
    this.declare(name)
    this.binaries.push(name)
    return name
  }

  /** A continuous variable with bounds [0, +∞), the LP-format default. */
  nonNegative(name: string): string {
    this.declare(name)
    this.continuous.push(name)
    return name
  }

  /** Adds `lhs op rhs`; either side may mix variables and constants. */
  constrain(lhs: Lin, op: Op, rhs: Lin | number = 0): void {
    this.rows.push(toRow(lhs, op, rhs))
  }

  private declare(name: string): void {
    if (this.declared.has(name)) throw new Error(`Variable declared twice: ${name}`)
    this.declared.add(name)
  }
}

/** Moves everything to the left: Σ terms op rhs, zero coefficients dropped. */
export function toRow(lhs: Lin, op: Op, rhs: Lin | number = 0): Row {
  const diff = new Lin().plus(lhs).plus(typeof rhs === 'number' ? Lin.constant(rhs) : rhs, -1)
  const terms = new Map([...diff.terms].filter(([, coef]) => coef !== 0))
  if (terms.size === 0) throw new Error(`Constraint has no variables (0 ${op} ${-diff.constant})`)
  return { terms, op, rhs: -diff.constant }
}

export function toLpText(milp: Milp, objective: Lin, extraRows: Row[] = []): string {
  const lines = ['Minimize', ` obj: ${formatTerms(objective.terms)}`, 'Subject To']
  const rows = [...milp.rows, ...extraRows]
  rows.forEach((row, i) => {
    lines.push(` r${i}: ${formatTerms(row.terms)} ${row.op} ${formatNumber(row.rhs)}`)
  })
  if (milp.binaries.length > 0) {
    lines.push('Binary', ...chunks(milp.binaries, 10).map((names) => ` ${names.join(' ')}`))
  }
  lines.push('End')
  return lines.join('\n')
}

function formatTerms(terms: Map<string, number>): string {
  const parts = [...terms]
    .filter(([, coef]) => coef !== 0)
    .map(
      ([variable, coef]) => `${coef < 0 ? '-' : '+'} ${formatNumber(Math.abs(coef))} ${variable}`,
    )
  return chunks(parts, 8)
    .map((line) => line.join(' '))
    .join('\n   ')
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toPrecision(15)
}

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}
