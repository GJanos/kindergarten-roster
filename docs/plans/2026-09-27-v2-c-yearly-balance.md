# v2-C — Yearly balance — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a period can't be split evenly, the extra unit goes to whoever has had less of it in the kindergarten year so far; the uneven-share warning says so, and a table shows each person's year.

**Architecture:** Every roster stores its own fairness deltas (`count − fair share` per person and kind) as `Roster.balance`, written where rosters are made (`makeRoster`, `editRoster`). `solveInputFor` sums the deltas of the year's earlier rosters into `SolveInput.history`. The model gains a seventh stage, `yearly`, after turnarounds, whose objective weights each count by that history. The fingerprint that marks a roster outdated ignores the history.

**Tech Stack:** TypeScript, highs 1.15.3, React 19, vitest 5.

---

## Before you start

- **Prerequisites:** `2026-09-27-v2-a-warning-names.md` and `2026-09-27-v2-b-swap.md` are done (`editRoster` exists).
- Design: `docs/specs/2026-09-27-v2-design.md`, section C. Spec: `docs/spec.md` §2 (her rules), §6.3 (fairness), §6.5 (stages), §7 (`UNEVEN`), §8.1.
- **Words used here.** A *kind* is one of the four fairness counts: `morning`, `opener`, `closer`, `reserve` (§6.3). A *delta* is one person's count of a kind minus their fair share in one roster. The *kindergarten year* runs Sep 1 – Aug 31; a week belongs to the year its Monday falls in.
- Conventions as in the v1 plans. The golden test runs only where `data/aug24.json` exists; Task 7 updates it.

## File structure

```text
src/core/types.ts            GapKind moves here; Balance; Roster.balance; SolveInput.history
src/core/fairness.ts         re-exports GapKind; balanceOf(input, roster)
src/core/pipeline.ts         makeRoster stores balance
src/core/edit.ts             editRoster stores balance
src/core/model.ts            stage 'yearly'
src/core/explain.ts          UNEVEN passes the year's delta
src/i18n/hu.ts               uneven(…, yearly?); year table texts
src/state/history.ts         NEW  yearStart, yearlyHistory, yearTotals
src/state/solveInput.ts      input.history
src/ui/YearBalance.tsx       NEW  folded table
src/ui/StaffScreen.tsx       shows YearBalance
tests/core/balance.test.ts   NEW
tests/core/yearly.test.ts    NEW  the stage decides the rounded-up unit
tests/state/history.test.ts  NEW
tests/ui/YearBalance.test.tsx NEW
tests/core/explain.test.ts · tests/i18n/warningText.test.ts · tests/state/solveInput.test.ts · tests/core/pipeline.test.ts
docs/spec.md
```

---

### Task 1: Types and `balanceOf`

**Files:**
- Modify: `src/core/types.ts`, `src/core/fairness.ts`
- Test: `tests/core/balance.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { TEST_META, makeInput } from './fixtures'
import type { Roster } from '../../src/core/types'
import { balanceOf } from '../../src/core/fairness'

const WED = '2026-10-28'
// 2 teachers, 2 nannies, 1 group: every fair share is ½.
const input = makeInput({ teachers: 2, nannies: 2, groups: 1, days: [WED] })
const roster: Roster = {
  period: input.period,
  groupsPerDay: { [WED]: 1 },
  assignments: [
    { staffId: 't1', date: WED, shift: 'morning', seat: { kind: 'teacher', group: 1, shift: 'morning' } },
    { staffId: 't2', date: WED, shift: 'afternoon', seat: { kind: 'teacher', group: 1, shift: 'afternoon' } },
    { staffId: 'n1', date: WED, shift: 'morning', seat: { kind: 'nanny', group: 1 }, opener: true },
    { staffId: 'n2', date: WED, shift: 'afternoon', closer: true },
  ],
  holes: [],
  warnings: [],
  ...TEST_META,
}

describe('balanceOf', () => {
  it("gives each person's count minus fair share, per kind", () => {
    expect(balanceOf(input, roster)).toEqual({
      t1: { morning: 0.5, reserve: 0 },
      t2: { morning: -0.5, reserve: 0 },
      n1: { morning: 0.5, reserve: -0.5, opener: 0.5, closer: -0.5 },
      n2: { morning: -0.5, reserve: 0.5, opener: -0.5, closer: 0.5 },
    })
  })
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/core/balance.test.ts`
Expected: FAIL — `balanceOf` is not exported.

- [ ] **Step 3: Types**

In `src/core/types.ts`, add below `export const SHIFTS …`:

```ts
/** The four fairness counts (spec §6.3). */
export type GapKind = 'morning' | 'opener' | 'closer' | 'reserve'

/** Per person (staff id), per kind: count minus fair share — one roster's, or a year's sum. */
export type Balance = Record<string, Partial<Record<GapKind, number>>>
```

add to `Roster`, after `edited?: true …`:

```ts
  balance?: Balance // its fairness deltas, summed into the yearly balance (v2)
```

and to `SolveInput`, after `dayPlans`:

```ts
  history?: Balance // the kindergarten year's earlier rosters, summed; the last tie-break (v2)
```

In `src/core/fairness.ts`, replace `export type GapKind = 'morning' | 'opener' | 'closer' | 'reserve'` with

```ts
export type { GapKind } from './types'
```

and change the type import to `import type { Assignment, Balance, GapKind, Roster, SolveInput } from './types'`.

- [ ] **Step 4: `balanceOf`**

Append to `src/core/fairness.ts`:

```ts
/** What this roster adds to each person's year: count minus fair share, per kind. */
export function balanceOf(input: SolveInput, roster: Roster): Balance {
  const out: Balance = {}
  for (const share of fairShares(input)) {
    const delta = countFor(share, roster) - share.num / share.den
    const mine = (out[share.staffId] ??= {})
    mine[share.kind] = Math.round(delta * 10_000) / 10_000 || 0 // tidy JSON, no −0
  }
  return out
}
```

- [ ] **Step 5: Run it to see it pass, then commit**

Run: `npx tsc --noEmit && npx vitest run tests/core`
Expected: PASS.

```bash
git add src/core/types.ts src/core/fairness.ts tests/core/balance.test.ts
git commit -m "feat(core): balanceOf — a roster's fairness deltas"
```

---

### Task 2: Every roster stores its balance

**Files:**
- Modify: `src/core/pipeline.ts`, `src/core/edit.ts`
- Test: `tests/core/pipeline.test.ts`, `tests/core/edit.test.ts`

- [ ] **Step 1: Write the failing tests**

In `tests/core/pipeline.test.ts`, add `import { balanceOf } from '../../src/core/fairness'` and inside `describe('makeRoster', …)`:

```ts
  it('stores the roster’s fairness deltas for the yearly balance', () => {
    const input = makeInput({ teachers: 4, nannies: 3, groups: 2, days: ['2026-10-28'] })
    const result = makeRoster(input, highs, TEST_META)
    if (!result.ok) throw new Error('must solve')
    expect(result.roster.balance).toEqual(balanceOf(input, result.roster))
  })
```

In `tests/core/edit.test.ts`, add `import { balanceOf } from '../../src/core/fairness'` and inside `describe('editRoster', …)`:

```ts
  it('stores the edited roster’s own deltas', () => {
    const result = editRoster(input, base, { date: MON, a: seated[0].staffId, b: seated[1].staffId })
    if (!result.ok) throw new Error('must be accepted')
    expect(result.roster.balance).toEqual(balanceOf(input, result.roster))
  })
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/core/pipeline.test.ts tests/core/edit.test.ts`
Expected: 2 failed — `balance` is `undefined`.

- [ ] **Step 3: Implement**

`src/core/pipeline.ts`: add `import { balanceOf } from './fairness'` and change the last line of `makeRoster` to

```ts
  return {
    ok: true,
    roster: { ...roster, warnings: explain(input, roster), balance: balanceOf(input, roster) },
  }
```

`src/core/edit.ts`: add `import { balanceOf } from './fairness'` and change the last line of `editRoster` to

```ts
  return {
    ok: true,
    roster: {
      ...swapped,
      edited: true,
      warnings: explain(input, swapped),
      balance: balanceOf(input, swapped),
    },
  }
```

- [ ] **Step 4: Run and commit**

Run: `npx vitest run tests/core`
Expected: PASS.

```bash
git add src/core/pipeline.ts src/core/edit.ts tests/core/pipeline.test.ts tests/core/edit.test.ts
git commit -m "feat(core): solved and edited rosters store their balance"
```

---

### Task 3: The year's history reaches the solve input

**Files:**
- Create: `src/state/history.ts`
- Modify: `src/state/solveInput.ts`
- Test: `tests/state/history.test.ts`, `tests/state/solveInput.test.ts`

- [ ] **Step 1: Write the failing tests**

`tests/state/history.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { TEST_META } from '../core/fixtures'
import type { Balance, Roster } from '../../src/core/types'
import { emptyState, type AppState } from '../../src/state/appState'
import { yearStart, yearlyHistory } from '../../src/state/history'

const saved = (monday: string, balance: Balance): { dayPlans: []; roster: Roster } => ({
  dayPlans: [],
  roster: {
    period: { start: monday, days: [] },
    groupsPerDay: {},
    assignments: [],
    holes: [],
    warnings: [],
    balance,
    ...TEST_META,
  },
})

describe('yearStart', () => {
  it('is Sep 1 of the kindergarten year the date falls in', () => {
    expect(yearStart('2026-10-26')).toBe('2026-09-01')
    expect(yearStart('2027-03-01')).toBe('2026-09-01')
    expect(yearStart('2026-09-01')).toBe('2026-09-01')
    expect(yearStart('2026-08-31')).toBe('2025-09-01')
  })
})

describe('yearlyHistory', () => {
  it("sums the year's earlier rosters, and only those", () => {
    const state: AppState = {
      ...emptyState(),
      periods: {
        '2026-08-24': saved('2026-08-24', { n1: { opener: 5 } }), // last year
        '2026-10-26': saved('2026-10-26', { n1: { opener: 0.5 } }),
        '2026-12-21': saved('2026-12-21', { n1: { opener: 0.5 }, n2: { closer: -0.5 } }),
        '2027-01-04': saved('2027-01-04', { n1: { opener: 9 } }), // the week itself
        '2027-02-15': saved('2027-02-15', { n1: { opener: 9 } }), // later
      },
    }
    expect(yearlyHistory(state, '2027-01-04')).toEqual({ n1: { opener: 1 }, n2: { closer: -0.5 } })
  })

  it('counts a roster saved before v2 (no balance) as nothing', () => {
    const state: AppState = {
      ...emptyState(),
      periods: { '2026-10-26': { dayPlans: [], roster: { ...saved('2026-10-26', {}).roster, balance: undefined } } },
    }
    expect(yearlyHistory(state, '2026-11-02')).toEqual({})
  })
})
```

In `tests/state/solveInput.test.ts`, add inside `describe('inputKey', …)`:

```ts
  it('ignores the yearly history, which is only a tie-break', () => {
    const key = inputKey(solveInputFor(base(), WEEK))
    const withHistory = { ...solveInputFor(base(), WEEK), history: { a: { morning: 3 } } }
    expect(inputKey(withHistory)).toBe(key)
  })
```

and inside `describe('solveInputFor', …)`:

```ts
  it('carries the kindergarten year so far', () => {
    expect(solveInputFor(base(), WEEK).history).toEqual({})
  })
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/state`
Expected: `history.test.ts` can't resolve `src/state/history`; the `carries the kindergarten year` test fails (`history` is undefined). The `ignores the yearly history` test already passes — `inputKey` never read it; it guards that it stays so.

- [ ] **Step 3: Implement**

`src/state/history.ts`:

```ts
import type { Balance, GapKind } from '../core/types'
import type { AppState } from './appState'

/** Sep 1 of the kindergarten year `date` falls in (the year her balance resets). */
export function yearStart(date: string): string {
  const year = Number(date.slice(0, 4))
  return date.slice(5) >= '09-01' ? `${year}-09-01` : `${year - 1}-09-01`
}

/** Adds one roster's balance into a running total. */
function addInto(total: Balance, balance: Balance): void {
  for (const [staffId, kinds] of Object.entries(balance)) {
    const mine = (total[staffId] ??= {})
    for (const [kind, delta] of Object.entries(kinds) as [GapKind, number][]) {
      mine[kind] = (mine[kind] ?? 0) + delta
    }
  }
}

/**
 * The kindergarten year before `week` (a Monday): the stored deltas of every earlier roster of
 * that year, summed. Rosters saved before v2 carry none and add nothing.
 */
export function yearlyHistory(state: AppState, week: string): Balance {
  const from = yearStart(week)
  const total: Balance = {}
  for (const [monday, period] of Object.entries(state.periods)) {
    if (monday < from || monday >= week || !period.roster?.balance) continue
    addInto(total, period.roster.balance)
  }
  return total
}
```

In `src/state/solveInput.ts`, add `import { yearlyHistory } from './history'` and, in the object `solveInputFor` returns, after `dayPlans: …`:

```ts
    history: yearlyHistory(state, week),
```

(`inputKey` lists staff, absences, days and plans explicitly, so it keeps ignoring `history`.)

- [ ] **Step 4: Run and commit**

Run: `npx tsc --noEmit && npx vitest run tests/state`
Expected: PASS.

```bash
git add src/state/history.ts src/state/solveInput.ts tests/state/history.test.ts tests/state/solveInput.test.ts
git commit -m "feat(state): the kindergarten year's history reaches the solve input"
```

---

### Task 4: The `yearly` stage

**Files:**
- Modify: `src/core/model.ts`
- Test: `tests/core/yearly.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import loadHighs from 'highs'
import { describe, expect, it } from 'vitest'
import { TEST_META, consecutiveDays, makeInput } from './fixtures'
import { buildModel } from '../../src/core/model'
import { solve } from '../../src/core/solve'
import type { Balance } from '../../src/core/types'

const highs = await loadHighs()
const WED = '2026-10-28'
// One day, one group, 2 teachers, 2 nannies: who opens, and who works mornings, are ties.
const day = (history?: Balance) => ({
  ...makeInput({ teachers: 2, nannies: 2, groups: 1, days: [WED] }),
  ...(history ? { history } : {}),
})
const opener = (history: Balance) =>
  solve(day(history), highs, TEST_META).assignments.find((a) => a.opener)?.staffId

describe('the yearly stage', () => {
  it('gives the opening to the nanny who has opened less this year', () => {
    expect(opener({ n1: { opener: 2 } })).toBe('n2')
    expect(opener({ n2: { opener: 2 } })).toBe('n1')
  })

  it('gives the morning to the teacher who has had fewer mornings', () => {
    const roster = solve(day({ t1: { morning: 1.5 } }), highs, TEST_META)
    expect(roster.assignments.find((a) => a.staffId === 't2')?.shift).toBe('morning')
  })

  it('never trades period fairness for the year', () => {
    // 3 days, 3 nannies: the fair share is exactly one opening each. n1 is far ahead this year,
    // yet still opens once — no strict rule forces that, only stages 3–4 coming first.
    const week = {
      ...makeInput({ teachers: 2, nannies: 3, groups: 1, days: consecutiveDays('2026-10-26', 3) }),
      history: { n1: { opener: 10 } },
    }
    const openings = solve(week, highs, TEST_META)
      .assignments.filter((a) => a.opener)
      .map((a) => a.staffId)
      .sort()
    expect(openings).toEqual(['n1', 'n2', 'n3'])
  })

  it('is skipped when there is no history', () => {
    expect(buildModel(day()).objectives.yearly.isEmpty()).toBe(true)
  })
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/core/yearly.test.ts`
Expected: FAIL — `objectives.yearly` is undefined, and the first test may pick `n1`.

- [ ] **Step 3: Implement**

In `src/core/model.ts`:

1. Add `'yearly',` after `'turnarounds',` in `STAGES`, and update its comment to `/** Solve stages in strict priority order (spec §6.5); 'yearly' is the v2 tie-break. */`.
2. In the fairness loop, directly after `objectives.totalGap.add(gap)`, add:

```ts
    // The year so far: someone ahead on this count is steered away from more of it (v2).
    const year = input.history?.[share.staffId]?.[share.kind] ?? 0
    if (year !== 0) objectives.yearly.plus(count, year)
```

(`Lin.plus` scales every term; the reserve count's constant is dropped when the objective is written, which doesn't change the optimum. The stage is not integral, and as the last one its bound constrains nothing.)

- [ ] **Step 4: Run the core tests**

Run: `npx vitest run tests/core`
Expected: PASS, the property tests included (no history there, so the stage is skipped).

- [ ] **Step 5: Commit**

```bash
git add src/core/model.ts tests/core/yearly.test.ts
git commit -m "feat(core): yearly stage — the year so far breaks the last ties"
```

---

### Task 5: `UNEVEN` says how the year stands

**Files:**
- Modify: `src/i18n/hu.ts` (`warningText.uneven`), `src/core/explain.ts`
- Test: `tests/i18n/warningText.test.ts`, `tests/core/explain.test.ts`

- [ ] **Step 1: Write the failing tests**

In `tests/i18n/warningText.test.ts`, add inside the `describe` that holds `'counts out of the period with the right suffix'`:

```ts
  it('adds the year so far when it is a whole day or more either way', () => {
    expect(t.uneven('Nóra', { kind: 'afternoon', count: 3, of: 5 }, 2)).toBe(
      'Egyenlő elosztás nem volt lehetséges: Nóra 3 délutános műszak az 5-ből. Idén eddig 2 délutánnal több jutott neki.',
    )
    expect(t.uneven('Kati', { kind: 'opener', count: 2, of: 3 }, -1.5)).toBe(
      'Egyenlő elosztás nem volt lehetséges: Kati 2 napon nyit a 3-ból. Idén eddig 2 nyitással kevesebb jutott neki.',
    )
    expect(t.uneven('Bea', { kind: 'reserve', count: 3, of: 4 }, 0.5)).toBe(
      'Egyenlő elosztás nem volt lehetséges: Bea 3 napon tartalék a 4-ből.',
    )
  })
```

In `tests/core/explain.test.ts`, inside the describe that holds `'reports a share missed by a whole day'`, add:

```ts
  it('adds how the year stands to an uneven share', () => {
    // Two afternoons of two; t1 has had 2 mornings fewer this year, i.e. 2 afternoons more.
    const warnings = explain(
      { ...input, history: { t1: { morning: -2 } } },
      roster([
        { staffId: 't1', date: MON, shift: 'afternoon' },
        { staffId: 't1', date: TUE, shift: 'afternoon' },
      ]),
    )
    expect(warnings.find((w) => w.code === 'UNEVEN' && w.cells[0].staffId === 't1')?.text).toBe(
      'Egyenlő elosztás nem volt lehetséges: T1 2 délutános műszak a 2-ből. Idén eddig 2 délutánnal több jutott neki.',
    )
  })
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/i18n/warningText.test.ts tests/core/explain.test.ts`
Expected: the two new tests fail — the sentence is missing.

- [ ] **Step 3: The text**

In `src/i18n/hu.ts`, above `export const warningText = {`, add:

```ts
/** "2 délutánnal több": the instrumental of each count, after a number. */
const yearNoun: Record<UnevenDetail['kind'], string> = {
  morning: 'délelőttel',
  afternoon: 'délutánnal',
  opener: 'nyitással',
  closer: 'zárással',
  reserve: 'tartaléknappal',
}
```

and in `warningText`, change `uneven` from `(name: string, detail: UnevenDetail) => {` to

```ts
  uneven: (name: string, detail: UnevenDetail, yearly?: number) => {
```

and its last line from

```ts
    return `Egyenlő elosztás nem volt lehetséges: ${name} ${what} ${outOf(detail.of)}.`
```

to

```ts
    const text = `Egyenlő elosztás nem volt lehetséges: ${name} ${what} ${outOf(detail.of)}.`
    if (yearly === undefined || Math.abs(yearly) < 1) return text
    const days = Math.round(Math.abs(yearly))
    return `${text} Idén eddig ${days} ${yearNoun[detail.kind]} ${yearly > 0 ? 'több' : 'kevesebb'} jutott neki.`
```

- [ ] **Step 4: `explain` passes the year**

In `src/core/explain.ts`, in the `fairShares` loop, replace

```ts
    add('UNEVEN', share.days[0], t.uneven(name(share.staffId), detail), {
```

with

```ts
    // Afternoons are the other side of mornings: a year's +2 mornings is −2 afternoons.
    const year = input.history?.[share.staffId]
    const yearly =
      year === undefined
        ? undefined
        : detail.kind === 'afternoon'
          ? -(year.morning ?? 0)
          : (year[detail.kind] ?? 0)
    add('UNEVEN', share.days[0], t.uneven(name(share.staffId), detail, yearly), {
```

- [ ] **Step 5: Run and commit**

Run: `npx tsc --noEmit && npx vitest run tests/core tests/i18n`
Expected: PASS.

```bash
git add src/i18n/hu.ts src/core/explain.ts tests/i18n/warningText.test.ts tests/core/explain.test.ts
git commit -m "feat(core): an uneven share says how the year stands"
```

---

### Task 6: Éves egyenleg — the year at a glance

**Files:**
- Modify: `src/state/history.ts` (add `yearTotals`)
- Create: `src/ui/YearBalance.tsx`
- Modify: `src/ui/StaffScreen.tsx`, `src/i18n/hu.ts`
- Test: `tests/state/history.test.ts`, `tests/ui/YearBalance.test.tsx`

- [ ] **Step 1: Write the failing tests**

Append to `tests/state/history.test.ts` (add `yearTotals` to the `history` import and `makeStaff` to the `../core/fixtures` import):

```ts
describe('yearTotals', () => {
  it("counts the year's worked days per person up to this week, with the deltas", () => {
    const monday = '2026-10-26'
    const period = saved(monday, { t1: { morning: 0.5 }, n1: { opener: 0.5, reserve: -0.5 } })
    period.roster.assignments = [
      { staffId: 't1', date: monday, shift: 'morning', seat: { kind: 'teacher', group: 1, shift: 'morning' } },
      { staffId: 'n1', date: monday, shift: 'morning', seat: { kind: 'nanny', group: 1 }, opener: true },
      { staffId: 'n1', date: '2026-10-27', shift: 'afternoon', closer: true },
    ]
    const state: AppState = {
      ...emptyState(),
      staff: makeStaff(1, 1),
      periods: { [monday]: period, '2026-11-09': saved('2026-11-09', { t1: { morning: 9 } }) },
    }
    expect(yearTotals(state, '2026-11-05')).toEqual([
      {
        staffId: 't1',
        counts: { morning: 1, afternoon: 0, opener: 0, closer: 0, reserve: 0 },
        deltas: { morning: 0.5 },
      },
      {
        staffId: 'n1',
        counts: { morning: 1, afternoon: 1, opener: 1, closer: 1, reserve: 1 },
        deltas: { opener: 0.5, reserve: -0.5 },
      },
    ])
  })
})
```

`tests/ui/YearBalance.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { TEST_META, makeStaff } from '../core/fixtures'
import { emptyState, type AppState } from '../../src/state/appState'
import { YearBalance } from '../../src/ui/YearBalance'

afterEach(cleanup)

const MON = '2026-10-26'
const state: AppState = {
  ...emptyState(),
  staff: makeStaff(1, 0),
  periods: {
    [MON]: {
      dayPlans: [],
      roster: {
        period: { start: MON, days: [MON] },
        groupsPerDay: { [MON]: 1 },
        assignments: [
          { staffId: 't1', date: MON, shift: 'morning', seat: { kind: 'teacher', group: 1, shift: 'morning' } },
        ],
        holes: [],
        warnings: [],
        balance: { t1: { morning: 0.5 } },
        ...TEST_META,
      },
    },
  },
}

describe('YearBalance', () => {
  it('shows the year per person, afternoons as the other side of mornings', () => {
    render(<YearBalance state={state} today="2026-11-05" />)
    expect(screen.getByText(/Éves egyenleg \(2026\/27\)/)).toBeTruthy()
    const row = screen.getByText('T1').closest('tr')!
    expect(row.textContent).toBe('T11 (+0,5)0 (−0,5)000')
  })

  it('shows nothing before the first saved roster of the year', () => {
    const { container } = render(<YearBalance state={emptyState()} today="2026-11-05" />)
    expect(container.textContent).toBe('')
  })
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/state/history.test.ts tests/ui/YearBalance.test.tsx`
Expected: FAIL — `yearTotals` is not exported; `src/ui/YearBalance` doesn't exist.

- [ ] **Step 3: `yearTotals`**

Append to `src/state/history.ts` (add `Shift` to the `../core/types` import):

```ts
export type YearCounts = Record<Shift | Exclude<GapKind, 'morning'>, number>
export type YearRow = { staffId: string; counts: YearCounts; deltas: Balance[string] }

/**
 * Each person's kindergarten year up to this week: days worked per shift, openings, closings and
 * reserve days, counted from the saved rosters, plus their summed deltas. Teachers first.
 */
export function yearTotals(state: AppState, today: string): YearRow[] {
  const from = yearStart(today)
  const rows = new Map<string, YearRow>()
  const rowOf = (staffId: string): YearRow => {
    let row = rows.get(staffId)
    if (!row) {
      row = {
        staffId,
        counts: { morning: 0, afternoon: 0, opener: 0, closer: 0, reserve: 0 },
        deltas: {},
      }
      rows.set(staffId, row)
    }
    return row
  }
  const deltas: Balance = {}
  for (const [monday, period] of Object.entries(state.periods)) {
    if (monday < from || monday > today || !period.roster) continue
    for (const a of period.roster.assignments) {
      const { counts } = rowOf(a.staffId)
      counts[a.shift]++
      if (a.opener) counts.opener++
      if (a.closer) counts.closer++
      if (!a.seat) counts.reserve++
    }
    if (period.roster.balance) addInto(deltas, period.roster.balance)
  }
  for (const [staffId, mine] of Object.entries(deltas)) rowOf(staffId).deltas = mine
  return state.staff
    .filter((s) => !s.deleted && rows.has(s.id))
    .sort((a, b) => (a.role === b.role ? 0 : a.role === 'teacher' ? -1 : 1))
    .map((s) => rows.get(s.id)!)
}
```

- [ ] **Step 4: Texts**

In `src/i18n/hu.ts`, inside `ui.staff`, add:

```ts
    yearBalance: (year: number) => `Éves egyenleg (${year}/${String((year + 1) % 100).padStart(2, '0')})`,
    yearBalanceHint:
      'Az idei (szeptember 1. óta) mentett beosztásokból. Zárójelben: ennyivel több (+) vagy ' +
      'kevesebb (−) jutott neki az egyenlő résznél. Ahol egy hét nem osztható el egyenlően, a ' +
      'következő beosztás ezt egyenlíti ki.',
    yearColumns: ['Név', 'Délelőtt', 'Délután', 'Nyit', 'Zár', 'Tartalék'],
```

- [ ] **Step 5: The component**

`src/ui/YearBalance.tsx`:

```tsx
import { ui } from '../i18n/hu'
import type { AppState } from '../state/appState'
import { yearStart, yearTotals } from '../state/history'
import { Info } from './Info'

/** '+0,5', '−1', or nothing when it rounds to zero. */
function signed(delta: number | undefined): string {
  if (delta === undefined || Math.abs(delta) < 0.05) return ''
  const size = String(Math.round(Math.abs(delta) * 10) / 10).replace('.', ',')
  return ` (${delta > 0 ? '+' : '−'}${size})`
}

/** The kindergarten year per person, folded away at the bottom of the Munkatársak tab. */
export function YearBalance({ state, today }: { state: AppState; today: string }) {
  const rows = yearTotals(state, today)
  if (rows.length === 0) return null
  const name = (id: string) => state.staff.find((s) => s.id === id)?.displayName ?? '?'
  const year = Number(yearStart(today).slice(0, 4))
  return (
    <details className="tips year-balance">
      <summary>
        {ui.staff.yearBalance(year)} <Info text={ui.staff.yearBalanceHint} />
      </summary>
      <table className="staff">
        <thead>
          <tr>
            {ui.staff.yearColumns.map((column) => (
              <th key={column}>{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ staffId, counts, deltas }) => (
            <tr key={staffId}>
              <td>{name(staffId)}</td>
              <td>{`${counts.morning}${signed(deltas.morning)}`}</td>
              <td>{`${counts.afternoon}${signed(deltas.morning === undefined ? undefined : -deltas.morning)}`}</td>
              <td>{`${counts.opener}${signed(deltas.opener)}`}</td>
              <td>{`${counts.closer}${signed(deltas.closer)}`}</td>
              <td>{`${counts.reserve}${signed(deltas.reserve)}`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  )
}
```

- [ ] **Step 6: Show it on the Munkatársak tab**

In `src/ui/StaffScreen.tsx`, add the imports

```ts
import { today } from './dates'
import { YearBalance } from './YearBalance'
```

and, directly after the closing `</div>` of `staff-columns`, add:

```tsx
      <YearBalance state={state} today={today()} />
```

- [ ] **Step 7: Run and commit**

Run: `npx prettier --write src tests && npx tsc --noEmit && npx vitest run`
Expected: all tests pass.

```bash
git add src/state/history.ts src/ui/YearBalance.tsx src/ui/StaffScreen.tsx src/i18n/hu.ts tests/state/history.test.ts tests/ui/YearBalance.test.tsx
git commit -m "feat(ui): Éves egyenleg on the Munkatársak tab"
```

---

### Task 7: Golden snapshot and spec

**Files:**
- Modify: `data/aug24.snapshot.json` (local only)
- Modify: `docs/spec.md`

- [ ] **Step 1: Golden week**

Run: `npx vitest run tests/scripts/golden.test.ts`
Expected where the data exists: FAIL with a diff that only **adds** a `"balance"` object to the roster. The golden week has no history, so `assignments`, `holes` and `warnings` must be unchanged — anything else is a bug. Then: `npx vitest run tests/scripts/golden.test.ts -u` → `1 passed`.

- [ ] **Step 2: Spec**

1. §2, in *As equal as possible*, delete ` (v2)` after *"whoever has had it better this year"*.
2. §6.5, replace item 6 with:

```markdown
6. **Turnarounds.**
7. **Yearly balance** — the tie-break of last resort. Each roster stores its fairness deltas
   (`count − share` per person and count); the kindergarten year's earlier rosters (Sep 1 onwards,
   by the week's Monday) are summed into `SolveInput.history`, and this stage minimises
   `Σ history × count`, so the rounded-up unit goes to whoever is behind this year. Rosters saved
   before v2 have no deltas and count as zero. The history is not part of the input fingerprint.
```

3. §7, in the `UNEVEN` row, replace the suggested-action cell `v2: who "had it better"` with `— ; adds *"Idén eddig 2 délutánnal több jutott neki."* when the year is ≥ 1 day off`.
4. §8.1, append:

```markdown
**Éves egyenleg (2026/27)** — a folded table at the bottom: per person the year's mornings,
afternoons, openings, closings and reserve days from the saved rosters, each with its difference
from an equal share, e.g. *12 (+1,5)*.
```

5. §13, delete the bullet that starts `- **Yearly balance**` (both lines).

- [ ] **Step 3: Format, check, commit**

```bash
npx prettier --write docs/spec.md && npx prettier --check . && npx vitest run
git add docs/spec.md
git commit -m "docs: yearly balance"
```

---

## Self-review notes

- Design §C coverage: stored deltas (Tasks 1–2), history from the year's earlier rosters with the Sep 1 reset (Task 3), stage 7 after turnarounds and outside the fingerprint (Tasks 3–4), period fairness first (Task 4, test 3), the `UNEVEN` sentence at ≥ 1 day (Task 5), Éves egyenleg (Task 6), pre-v2 rosters as zero (Task 3, test 2).
- Consistent names: `GapKind`, `Balance`, `Roster.balance`, `SolveInput.history`, `balanceOf`, `yearStart`, `yearlyHistory`, `yearTotals`, `YearRow`, stage `'yearly'`.
- Afternoons are never stored: an afternoon delta is always minus the morning delta (both shares are half the days worked), in the solver, in `UNEVEN` and in the table alike.
- Hungarian check: *délelőttel, délutánnal, nyitással, zárással, tartaléknappal* are the instrumental forms after a number (*2 délutánnal több*).
