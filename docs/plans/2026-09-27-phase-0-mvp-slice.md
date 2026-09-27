# Phase 0 — MVP Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `npm run slice` turns one hand-transcribed break week into a fair roster in `beosztas-<date>.xlsx`, so the head of staff can judge the solver on paper before any UI exists.

**Architecture:** A pure TypeScript core (`src/core/`) builds a 0/1 MILP from the staff, absences and group counts, writes it as CPLEX LP text and solves it with HiGHS (WebAssembly, the `highs` npm package) in six lexicographic stages: holes → substitutions → worst fairness gap → total gap → group switches → turnarounds. `validateRoster` re-checks every strict rule without looking at the model. `src/export/` turns a roster into the two printed tables and an Excel file; `scripts/slice.ts` wires it together in Node.

**Tech Stack:** TypeScript 7, Node 24, vitest 5, highs 1.15.3 (pinned), ExcelJS 4.4, tsx, prettier 3.

---

## Where this plan fits

The design is `docs/spec.md` (approved 2026-09-26, scope frozen). Delivery (spec §12) is three plans:

1. **Phase 0 — MVP slice** (this plan): the command-line slice and a printout she judges. **Gate: continue only if she approves the printout (Task 16).**
2. **Phase 1 — Core** (`2026-09-27-phase-1-core.md`): the Hungarian calendar, shortage helpers, `explain` (the warnings), the pipeline, and the property and golden tests.
3. **Phase 2 — App** (`2026-09-27-phase-2-app.md`): the three screens, print, Excel with backup, offline, demo data and deploy. That is v1, due in her hands by **2026-10-20**.

Every code block in the three plans was run. The finished code base passes typecheck, prettier and the whole suite (176 tests, plus a golden test that runs only where `data/` exists). Each plan was also replayed task by task into an empty repository, checking every "expected FAIL", "expected PASS" and commit on the way. The test counts quoted below come from that replay.

## Conventions

- Run commands from the repository root in a POSIX shell (Git Bash on Windows), with Node 24.
- Code blocks are complete and already prettier-formatted (`printWidth` 100, no semicolons, single quotes). Copy them exactly.
- "Add above/below the line X" inserts the block as new lines at that spot. Keep one blank line between top-level declarations and between sections.
- One commit per task, with the conventional-commit message given. Never commit `data/`: it is gitignored because real names live only there.
- Solver tests run real MILP solves, and one test can take a few seconds. The vitest timeout is 60 s.

## The domain in brief

- **Period:** a school-break week of 1–6 working days. Holidays shrink it, and a working Saturday extends it.
- **Staff:** teachers (*óvónő*, `teacher`) and nannies (*dajka*, `nanny`). Everyone present works exactly one shift a day: morning (*DE*) or afternoon (*DU*). Shift times are fixed (spec §2) and never optimised.
- **Seats:** each open group needs a morning teacher, an afternoon teacher and one nanny (either shift). Anyone present without a seat is **reserve** (*tartalék*). A teacher may sit in a nanny seat as a **substitution** when nannies run out.
- **Keys:** the whole kindergarten needs one **opener** (a morning nanny, 6:00) and one **closer** (an afternoon nanny, 18:00) each day. Nobody opens, or closes, on every day of the period.
- **Shortage:** when staff can't fill everything, the roster still comes back, with explicit **holes** (*betöltetlen*). The model is never infeasible.

## Improvements over the spec

The spec is frozen, so none of these adds scope. They are decisions the spec left open, or corrections found by measuring. Each one is pinned by a test.

1. **Fair shares are constants.** The spec (§6.3) defines shares from "the period's openings" and "the role's reserve days". Once holes and substitutions are minimal (stages 1–2), both totals are fixed by the headcount. So `fairShares` computes every share up front as a fraction `num / den`, and the gap rows are multiplied by `den` to keep integer coefficients.
2. **Lower bounds make stage 3 fast.** No roster can beat the rounding: every gap has a whole-number floor `den·gap ≥ min(r, den − r)`, and `worst` has an apportionment floor (the shares in a pool must round to whole days, so someone rounds up). Without these, HiGHS spent seconds proving the min-max optimum and timed out on realistic weeks. With them the worst-gap stage is nearly instant.
3. **A 4 s budget per stage.** The spec says six solves "take milliseconds". Measured, a typical break week takes 1–3 s and the slowest seen about 5 s; the switch and turnaround stages dominate. A stage that runs out of time keeps the best roster found so far. Every rule is a hard constraint, so that roster is valid. The same input still gives the same roster whenever every stage finishes in time, which holds for every realistic week measured.
4. **Substitutions only where they can help.** Substitution variables exist only on days with fewer nannies than groups, and only present people get variables at all. That enforces the spec's "a substitution happens only when it removes a hole" by construction, and shrinks the model.
5. **Lone-nanny days leave the key balance.** On a day with a single nanny her key is forced, and the other key is a hole. Counting that day would punish her for being alone.
6. **Turnarounds need adjacent calendar days.** A Friday close followed by a Monday open is not a turnaround. Only nannies are counted, because teacher shifts reach neither 6:00 nor 18:00.
7. **Switches chain over open days.** A closed day doesn't break the chain; a reserve day or an absence does (spec §6.4).
8. **An override is capped at g_max.** An override above what the day can staff would make the strict rules unsatisfiable, and the spec promises that a roster always comes back.
9. **Closed days are empty.** An override of 0 means nobody works and there are no holes. The day is left out of fairness and out of "not every day". A day with `g_max = 0` that she did not close still has nannies working, opening and closing.
10. **Fairness outranks comfort, as the spec orders it.** A short week often keeps one turnaround, because the nanny who closes on Monday must open later to balance her mornings. A test documents this.
11. **Capacity comes forward into Phase 0.** Without the effective group count, one short day in her week would make the model infeasible.
12. **The pieces the app will need already exist:** Hungarian strings in one file (`src/i18n/hu.ts`), and one "view" module that both print and Excel read. The slice runner is only a thin script.

## File structure

```text
package.json · tsconfig.json · vitest.config.ts · .prettierrc.json · .prettierignore
src/core/types.ts         domain types (spec §5) plus SolveInput and RosterMeta
src/core/calendar.ts      ISO-date arithmetic (Phase 1 adds the Hungarian calendar)
tests/core/fixtures.ts    test builders: makeInput, randomInput (seeded), TEST_META
src/core/capacity.ts      per-day headcount, g_max, effective group count (§6.6)
src/core/lp.ts            Lin/Milp model builder and CPLEX LP writer
src/core/validate.ts      validateRoster: every strict rule, independent of the model
src/core/model.ts         input → MILP: strict rules, fairness, switches, turnarounds
src/core/fairness.ts      fair shares and lower bounds on the worst gap
src/core/solve.ts         staged HiGHS solve, decoded into a Roster
src/core/metrics.ts       group switches and turnarounds of a finished roster
src/i18n/hu.ts            Hungarian dates, group names, legend
src/export/views.ts       the two printed tables as plain data (print and Excel share it)
src/export/xlsx.ts        Excel workbook
scripts/slice-input.ts    the transcribed-week JSON format → SolveInput
scripts/slice.ts          npm run slice
scripts/slice-example.json  an invented example week
```

Tests live in `tests/`, which mirrors `src/` and `scripts/` (`src/core/lp.ts` → `tests/core/lp.test.ts`), with the test-only fixtures in `tests/core/fixtures.ts`. `src/core/` must stay free of React and browser APIs, because it runs unchanged in Node (slice, tests) and in the Web Worker.

---

### Task 1: Project scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `.prettierrc.json`, `.prettierignore`

- [ ] **Step 1: Write the configuration**

`package.json`. `highs` is pinned exactly: the roster, and later the golden test, depend on the solver build.

```json
{
  "name": "kindergarten-roster",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "slice": "tsx scripts/slice.ts"
  },
  "dependencies": {
    "exceljs": "^4.4.0",
    "highs": "1.15.3"
  },
  "devDependencies": {
    "@types/node": "^26.6.3",
    "prettier": "^3.9.9",
    "tsx": "^4.23.15",
    "typescript": "^7.0.2",
    "vitest": "^5.0.2"
  }
}
```

`tsconfig.json`. It is already the final version, with JSX and DOM types ready for Phase 2.

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "resolveJsonModule": true,
    "types": ["node"]
  },
  "include": ["src", "tests", "scripts", "vite.config.ts"]
}
```

`vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Solver tests run real MILP solves; a few take seconds.
    testTimeout: 60_000,
  },
})
```

`.prettierrc.json`:

```json
{
  "semi": false,
  "singleQuote": true,
  "printWidth": 100
}
```

`.prettierignore`. The lock file and the Markdown docs keep their own formatting.

```text
package-lock.json
docs/
```

- [ ] **Step 2: Install**

Run: `npm install`

Expected: `added … packages`, and a new `package-lock.json`.

- [ ] **Step 3: Check the tools**

Run: `npx tsc --version && npx vitest --version`

Expected: `Version 7.…` and `vitest/5.…`.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json tsconfig.json vitest.config.ts .prettierrc.json .prettierignore
git commit -m "chore: scaffold TypeScript, vitest and prettier"
```

---

### Task 2: Domain types and date arithmetic

**Files:**
- Create: `src/core/types.ts`, `src/core/calendar.ts`
- Test: `tests/core/calendar.test.ts`

Dates are ISO strings (`'2026-10-26'`) throughout. Arithmetic goes through UTC, so the October clock change can never shift a day.

- [ ] **Step 1: Write the types**

`src/core/types.ts` is spec §5, plus `SolveInput` (everything a solve needs) and `RosterMeta`:

```ts
export type Role = 'teacher' | 'nanny'
export type Shift = 'morning' | 'afternoon'
export const SHIFTS: readonly Shift[] = ['morning', 'afternoon']

export type Staff = {
  id: string
  fullName: string
  displayName: string
  role: Role
  active: boolean
}
export type Absence = { staffId: string; date: string } // ISO date, one row per absent day

export type Period = { start: string; days: string[] } // working days only, 1–6 of them
export type DayPlan = { date: string; requestedGroups: number; override?: number } // override 0 = closed

/** Groups are numbered from 1, as on the wall. */
export type Seat =
  { kind: 'teacher'; group: number; shift: Shift } | { kind: 'nanny'; group: number }

export type Assignment = {
  staffId: string
  date: string
  shift: Shift
  seat?: Seat // absent seat = reserve
  substitution?: true // teacher in a nanny seat
  opener?: true
  closer?: true
}

export type Hole =
  | { kind: 'teacherSeat'; date: string; group: number; shift: Shift }
  | { kind: 'opener' | 'closer'; date: string }

export type WarningCode =
  | 'NO_TEACHER'
  | 'TEACHER_SEAT_EMPTY'
  | 'OPENER_MISSING'
  | 'CLOSER_MISSING'
  | 'GROUPS_REDUCED'
  | 'GROUPS_OVERRIDDEN'
  | 'SUBSTITUTION'
  | 'CLOSED_DAY'
  | 'GROUP_SWITCH'
  | 'TURNAROUND'
  | 'UNEVEN'

export type Severity = 'red' | 'orange' | 'grey'

export type Warning = {
  code: WarningCode
  severity: Severity
  date: string
  text: string // Hungarian, ready to show
  action?: string // Hungarian suggestion
  fix?: { kind: 'setGroups'; date: string; groups: number } // one-click button
  cells: { staffId?: string; date: string; group?: number }[] // for hover highlight
}

export type Roster = {
  period: Period
  groupsPerDay: Record<string, number> // effective count after g_max/override
  assignments: Assignment[]
  holes: Hole[]
  warnings: Warning[]
  solvedAt: string
  appVersion: string
}

/** Everything a solve needs. Inactive staff are ignored. */
export type SolveInput = {
  staff: Staff[]
  absences: Absence[]
  period: Period
  dayPlans: DayPlan[] // one per period day
}

export type RosterMeta = { solvedAt: string; appVersion: string }
```

- [ ] **Step 2: Write the failing test**

`tests/core/calendar.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { addDays, weekday } from '../../src/core/calendar'

describe('addDays and weekday', () => {
  it('moves across month and year ends and the October clock change', () => {
    expect(addDays('2026-10-30', 3)).toBe('2026-11-02')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
    expect(addDays('2026-10-24', 2)).toBe('2026-10-26')
  })

  it('knows the weekday', () => {
    expect(weekday('2026-10-26')).toBe(1)
    expect(weekday('2026-10-31')).toBe(6)
    expect(weekday('2026-11-01')).toBe(0)
  })
})
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run tests/core/calendar.test.ts`

Expected: FAIL — `Cannot find module '../../src/core/calendar'`.

- [ ] **Step 4: Implement**

`src/core/calendar.ts`:

```ts
const DAY_MS = 86_400_000

function toUtcMs(date: string): number {
  return Date.parse(`${date}T00:00:00Z`)
}

/** `date` moved by `days` calendar days. ISO dates in UTC, so time zones never shift a day. */
export function addDays(date: string, days: number): string {
  return new Date(toUtcMs(date) + days * DAY_MS).toISOString().slice(0, 10)
}

/** 0 = Sunday … 6 = Saturday. */
export function weekday(date: string): number {
  return new Date(toUtcMs(date)).getUTCDay()
}
```

- [ ] **Step 5: Run it to verify it passes**

Run: `npx vitest run tests/core/calendar.test.ts && npm run typecheck`

Expected: PASS (2 tests), and typecheck prints nothing.

- [ ] **Step 6: Commit**

```bash
git add src/core/types.ts src/core/calendar.ts tests/core/calendar.test.ts
git commit -m "feat(core): add domain types and ISO date arithmetic"
```

---

### Task 3: Test fixtures and capacity

**Files:**
- Create: `tests/core/fixtures.ts`, `src/core/capacity.ts`
- Test: `tests/core/capacity.test.ts`

`g_max = min(T, ⌊(T + N) / 2⌋)`: every group needs its own teacher, and every nanny seat needs a nanny or a spare teacher. The effective group count is the day's override if she set one, otherwise the requested count, and it never exceeds `g_max`. The fixtures build inputs with staff `t1…tN` (teachers) and `n1…nM` (nannies), with display names `T1`, `N1`.

- [ ] **Step 1: Write the fixtures**

`tests/core/fixtures.ts`. `randomInput` is seeded (mulberry32), so a failing random case can be reproduced from its seed.

```ts
import { addDays } from '../../src/core/calendar'
import type { Absence, DayPlan, RosterMeta, SolveInput, Staff } from '../../src/core/types'

/** Builders for tests. Nothing here reaches the app bundle. */

export const TEST_META: RosterMeta = { solvedAt: '2026-10-20T08:00:00.000Z', appVersion: 'test' }

/** Teachers t1…tN, then nannies n1…nM, all active; names are the ids in capitals. */
export function makeStaff(teachers: number, nannies: number): Staff[] {
  const person = (id: string, role: Staff['role']): Staff => ({
    id,
    fullName: id.toUpperCase(),
    displayName: id.toUpperCase(),
    role,
    active: true,
  })
  return [
    ...Array.from({ length: teachers }, (_, i) => person(`t${i + 1}`, 'teacher')),
    ...Array.from({ length: nannies }, (_, i) => person(`n${i + 1}`, 'nanny')),
  ]
}

export function consecutiveDays(start: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => addDays(start, i))
}

export type InputSpec = {
  teachers: number
  nannies: number
  groups: number
  days?: string[] // default: Monday 2026-10-26 to Friday 2026-10-30
  absent?: Record<string, string[]> // staff id → absent dates
  overrides?: Record<string, number> // date → group count
}

export function makeInput(spec: InputSpec): SolveInput {
  const days = spec.days ?? consecutiveDays('2026-10-26', 5)
  const absences: Absence[] = Object.entries(spec.absent ?? {}).flatMap(([staffId, dates]) =>
    dates.map((date) => ({ staffId, date })),
  )
  const dayPlans: DayPlan[] = days.map((date) => {
    const override = spec.overrides?.[date]
    return override === undefined
      ? { date, requestedGroups: spec.groups }
      : { date, requestedGroups: spec.groups, override }
  })
  return {
    staff: makeStaff(spec.teachers, spec.nannies),
    absences,
    period: { start: days[0], days },
    dayPlans,
  }
}

/** Deterministic pseudo-random numbers in [0, 1) (mulberry32). */
export function seededRandom(seed: number): () => number {
  let state = seed
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** A reproducible random period: 1–6 days, 1–4 groups, random staff, absences and overrides. */
export function randomInput(seed: number): SolveInput {
  const random = seededRandom(seed)
  const int = (lo: number, hi: number) => lo + Math.floor(random() * (hi - lo + 1))
  const days = consecutiveDays('2026-10-26', int(1, 6))
  const groups = int(1, 4)
  const input = makeInput({ teachers: int(2, 10), nannies: int(1, 6), groups, days })
  const absenceRate = random() * 0.3
  input.absences = input.staff.flatMap((s) =>
    days.filter(() => random() < absenceRate).map((date) => ({ staffId: s.id, date })),
  )
  input.dayPlans = days.map((date) =>
    random() < 0.1
      ? { date, requestedGroups: groups, override: int(0, groups) }
      : { date, requestedGroups: groups },
  )
  return input
}
```

- [ ] **Step 2: Write the failing test**

`tests/core/capacity.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { dayCapacities, gMax } from '../../src/core/capacity'
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
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run tests/core/capacity.test.ts`

Expected: FAIL — `Cannot find module '../../src/core/capacity'`.

- [ ] **Step 4: Implement**

`src/core/capacity.ts`:

```ts
import type { SolveInput } from './types'

export type DayCapacity = {
  date: string
  teachers: number // active teachers present
  nannies: number // active nannies present
  requested: number
  override?: number
  gMax: number
  groups: number // effective count
  closed: boolean // she set 0 groups: nobody works that day
}

/** Groups a day can start: each needs its own teacher, and every nanny seat a nanny or a spare teacher. */
export function gMax(teachers: number, nannies: number): number {
  return Math.min(teachers, Math.floor((teachers + nannies) / 2))
}

export function dayCapacities(input: SolveInput): DayCapacity[] {
  const absent = new Set(input.absences.map((a) => `${a.staffId}|${a.date}`))
  return input.period.days.map((date) => {
    const plan = input.dayPlans.find((p) => p.date === date)
    if (!plan) throw new Error(`No day plan for ${date}`)
    const present = input.staff.filter((s) => s.active && !absent.has(`${s.id}|${date}`))
    const teachers = present.filter((s) => s.role === 'teacher').length
    const nannies = present.length - teachers
    const max = gMax(teachers, nannies)
    return {
      date,
      teachers,
      nannies,
      requested: plan.requestedGroups,
      override: plan.override,
      gMax: max,
      // An override above g_max would make the strict rules unsatisfiable, so it is capped too.
      groups: Math.min(plan.override ?? plan.requestedGroups, max),
      closed: plan.override === 0,
    }
  })
}
```

- [ ] **Step 5: Run it to verify it passes**

Run: `npx vitest run tests/core/capacity.test.ts && npm run typecheck`

Expected: PASS (15 tests).

- [ ] **Step 6: Commit**

```bash
git add tests/core/fixtures.ts src/core/capacity.ts tests/core/capacity.test.ts
git commit -m "feat(core): add test fixtures and day capacity (g_max)"
```

---

### Task 4: LP builder and writer

**Files:**
- Create: `src/core/lp.ts`
- Test: `tests/core/lp.test.ts`

HiGHS reads models as CPLEX LP text. `Lin` is a sparse linear expression; `Milp` collects the variables and rows; `toLpText` writes a model with one objective and extra rows. The staged solve adds each stage's optimum as an extra row. Rows are wrapped at 8 terms, because very long lines are hard to debug.

- [ ] **Step 1: Write the failing test**

`tests/core/lp.test.ts`. The last test really solves with HiGHS, so the format is proven, not just snapshotted.

```ts
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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/core/lp.test.ts`

Expected: FAIL — `Cannot find module '../../src/core/lp'`.

- [ ] **Step 3: Implement**

`src/core/lp.ts`:

```ts
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
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run tests/core/lp.test.ts && npm run typecheck`

Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/lp.ts tests/core/lp.test.ts
git commit -m "feat(core): add sparse LP builder and CPLEX LP writer"
```

---

### Task 5: `validateRoster` — the independent rule check

**Files:**
- Create: `src/core/validate.ts`
- Test: `tests/core/validate.test.ts`

Spec §11.1: every strict rule is re-checked on the finished roster, without reading any solver internals, and a hit is a bug. It is written before the model so that every model test can use it. The test starts from one hand-built valid roster and breaks one rule at a time.

- [ ] **Step 1: Write the failing test**

`tests/core/validate.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { TEST_META, makeInput } from './fixtures'
import type { Assignment, Roster, SolveInput } from '../../src/core/types'
import { validateRoster } from '../../src/core/validate'

const D = '2026-10-26'
const E = '2026-10-27'

// One group: t1 morning, t2 afternoon, n1 in the group and opening, n2 in reserve closing.
function dayOf(date: string): Assignment[] {
  return [
    {
      staffId: 't1',
      date,
      shift: 'morning',
      seat: { kind: 'teacher', group: 1, shift: 'morning' },
    },
    {
      staffId: 't2',
      date,
      shift: 'afternoon',
      seat: { kind: 'teacher', group: 1, shift: 'afternoon' },
    },
    { staffId: 'n1', date, shift: 'morning', seat: { kind: 'nanny', group: 1 }, opener: true },
    { staffId: 'n2', date, shift: 'afternoon', closer: true },
  ]
}

function setup(days = [D]): { input: SolveInput; roster: Roster } {
  const input = makeInput({ teachers: 2, nannies: 2, groups: 1, days })
  const roster: Roster = {
    period: input.period,
    groupsPerDay: Object.fromEntries(days.map((d) => [d, 1])),
    assignments: days.flatMap(dayOf),
    holes: [],
    warnings: [],
    ...TEST_META,
  }
  return { input, roster }
}

const rules = (input: SolveInput, roster: Roster) =>
  validateRoster(input, roster).map((v) => v.rule)

function edit(roster: Roster, staffId: string, change: Partial<Assignment>): Roster {
  return {
    ...roster,
    assignments: roster.assignments.map((a) =>
      a.staffId === staffId && a.date === D ? { ...a, ...change } : a,
    ),
  }
}

describe('validateRoster', () => {
  it('accepts a valid roster', () => {
    const { input, roster } = setup()
    expect(validateRoster(input, roster)).toEqual([])
  })

  it('needs exactly one shift for everyone present', () => {
    const { input, roster } = setup()
    const missing = { ...roster, assignments: roster.assignments.filter((a) => a.staffId !== 't2') }
    expect(rules(input, missing)).toContain('presentNeedsExactlyOneShift')
    expect(rules(input, missing)).toContain('teacherSeatNotFilledOnce')
  })

  it('keeps the absent at home', () => {
    const { input, roster } = setup()
    input.absences = [{ staffId: 'n2', date: D }]
    expect(rules(input, roster)).toContain('absentButWorking')
  })

  it('keeps inactive staff out', () => {
    const { input, roster } = setup()
    input.staff[3].active = false // n2
    expect(rules(input, roster)).toContain('unknownOrInactiveStaff')
  })

  it('seats teachers on their own shift only', () => {
    const { input, roster } = setup()
    expect(rules(input, edit(roster, 't2', { shift: 'morning' }))).toContain('teacherSeatOffShift')
  })

  it('never seats a nanny in a teacher seat', () => {
    const { input, roster } = setup()
    const bad = edit(roster, 'n1', { seat: { kind: 'teacher', group: 1, shift: 'morning' } })
    expect(rules(input, bad)).toContain('nannyInTeacherSeat')
  })

  it('flags every teacher in a nanny seat as a substitution', () => {
    const { input, roster } = setup()
    const swapped = edit(edit(roster, 't1', { seat: { kind: 'nanny', group: 1 } }), 'n1', {
      seat: undefined,
    })
    expect(rules(input, swapped)).toContain('substitutionFlag')
  })

  it('opens on a morning shift and closes on an afternoon one', () => {
    const { input, roster } = setup()
    expect(rules(input, edit(roster, 'n1', { shift: 'afternoon' }))).toContain('openerNotMorning')
  })

  it('has exactly one opener, or a hole', () => {
    const { input, roster } = setup()
    expect(rules(input, edit(roster, 'n2', { opener: true }))).toContain('openerNotExactlyOne')
  })

  it('never lists a hole for a filled seat', () => {
    const { input, roster } = setup()
    const extra: Roster = {
      ...roster,
      holes: [{ kind: 'teacherSeat', date: D, group: 1, shift: 'morning' }],
    }
    expect(rules(input, extra)).toContain('teacherSeatNotFilledOnce')
  })

  it('leaves no group without a teacher', () => {
    const { input, roster } = setup()
    const empty: Roster = {
      ...roster,
      assignments: roster.assignments.map((a) =>
        a.staffId.startsWith('t') ? { ...a, seat: undefined } : a,
      ),
      holes: [
        { kind: 'teacherSeat', date: D, group: 1, shift: 'morning' },
        { kind: 'teacherSeat', date: D, group: 1, shift: 'afternoon' },
      ],
    }
    expect(rules(input, empty)).toContain('groupWithoutTeacher')
  })

  it('matches the effective group count', () => {
    const { input, roster } = setup()
    expect(rules(input, { ...roster, groupsPerDay: { [D]: 2 } })).toContain('groupCount')
  })

  it('never lets anyone open on every day', () => {
    const { input, roster } = setup([D, E])
    expect(rules(input, roster)).toEqual(
      expect.arrayContaining(['openerEveryDay', 'closerEveryDay']),
    )
  })

  it('keeps a closed day empty', () => {
    const { input, roster } = setup()
    input.dayPlans = [{ date: D, requestedGroups: 1, override: 0 }]
    expect(rules(input, { ...roster, groupsPerDay: { [D]: 0 } })).toContain('closedDayNotEmpty')
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/core/validate.test.ts`

Expected: FAIL — `Cannot find module '../../src/core/validate'`.

- [ ] **Step 3: Implement**

`src/core/validate.ts`. It has its own `groupNumbers`, so it shares no code with the model it checks.

```ts
import { dayCapacities } from './capacity'
import { SHIFTS, type Roster, type SolveInput } from './types'

export type Violation = { rule: string; date?: string; staffId?: string }

function groupNumbers(groups: number): number[] {
  return Array.from({ length: groups }, (_, i) => i + 1)
}

/**
 * Re-checks every strict rule (§6.2) on a finished roster, independently of the
 * solver. Any hit is a bug: the app never shows or prints such a roster.
 */
export function validateRoster(input: SolveInput, roster: Roster): Violation[] {
  const out: Violation[] = []
  const fail = (rule: string, date?: string, staffId?: string) => out.push({ rule, date, staffId })
  const people = new Map(input.staff.filter((s) => s.active).map((s) => [s.id, s]))
  const absent = new Set(input.absences.map((a) => `${a.staffId}|${a.date}`))
  const capacities = dayCapacities(input)

  if (roster.period.days.join() !== input.period.days.join()) fail('period')
  for (const a of roster.assignments) {
    if (!input.period.days.includes(a.date)) fail('assignmentOutsidePeriod', a.date, a.staffId)
    if (!people.has(a.staffId)) fail('unknownOrInactiveStaff', a.date, a.staffId)
  }

  for (const cap of capacities) {
    const date = cap.date
    const today = roster.assignments.filter((a) => a.date === date)
    const holes = roster.holes.filter((h) => h.date === date)
    if (roster.groupsPerDay[date] !== cap.groups) fail('groupCount', date)
    if (cap.closed) {
      if (today.length > 0 || holes.length > 0) fail('closedDayNotEmpty', date)
      continue
    }

    for (const person of people.values()) {
      const count = today.filter((a) => a.staffId === person.id).length
      const isAbsent = absent.has(`${person.id}|${date}`)
      if (isAbsent && count > 0) fail('absentButWorking', date, person.id)
      if (!isAbsent && count !== 1) fail('presentNeedsExactlyOneShift', date, person.id)
    }

    for (const a of today) {
      const role = people.get(a.staffId)?.role
      if (!a.seat) {
        if (a.substitution) fail('substitutionWithoutSeat', date, a.staffId)
      } else if (a.seat.group < 1 || a.seat.group > cap.groups) {
        fail('seatInMissingGroup', date, a.staffId)
      } else if (a.seat.kind === 'teacher') {
        if (role !== 'teacher') fail('nannyInTeacherSeat', date, a.staffId)
        if (a.seat.shift !== a.shift) fail('teacherSeatOffShift', date, a.staffId)
      } else if ((role === 'teacher') !== (a.substitution === true)) {
        fail('substitutionFlag', date, a.staffId)
      }
      if ((a.opener || a.closer) && role !== 'nanny') fail('keyNotNanny', date, a.staffId)
      if (a.opener && a.shift !== 'morning') fail('openerNotMorning', date, a.staffId)
      if (a.closer && a.shift !== 'afternoon') fail('closerNotAfternoon', date, a.staffId)
    }

    for (const g of groupNumbers(cap.groups)) {
      let emptyTeacherSeats = 0
      for (const t of SHIFTS) {
        const holders = today.filter(
          (a) => a.seat?.kind === 'teacher' && a.seat.group === g && a.seat.shift === t,
        ).length
        const empty = holes.filter(
          (h) => h.kind === 'teacherSeat' && h.group === g && h.shift === t,
        ).length
        if (holders + empty !== 1) fail('teacherSeatNotFilledOnce', date)
        emptyTeacherSeats += empty
      }
      if (emptyTeacherSeats > 1) fail('groupWithoutTeacher', date)
      const nannies = today.filter((a) => a.seat?.kind === 'nanny' && a.seat.group === g).length
      if (nannies !== 1) fail('nannySeatNotFilledOnce', date)
    }
    for (const h of holes) {
      if (h.kind === 'teacherSeat' && (h.group < 1 || h.group > cap.groups)) {
        fail('holeInMissingGroup', date)
      }
    }
    for (const key of ['opener', 'closer'] as const) {
      const holders = today.filter((a) => a[key]).length
      const empty = holes.filter((h) => h.kind === key).length
      if (holders + empty !== 1) fail(`${key}NotExactlyOne`, date)
    }
  }

  const openDays = capacities.filter((c) => !c.closed).length
  if (openDays >= 2) {
    for (const person of people.values()) {
      for (const key of ['opener', 'closer'] as const) {
        const days = roster.assignments.filter((a) => a.staffId === person.id && a[key]).length
        if (days === openDays) fail(`${key}EveryDay`, undefined, person.id)
      }
    }
  }
  return out
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run tests/core/validate.test.ts && npm run typecheck`

Expected: PASS (14 tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/validate.ts tests/core/validate.test.ts
git commit -m "feat(core): add validateRoster for every strict rule"
```

---

### Task 6: The model's strict rules and the staged solve

**Files:**
- Create: `src/core/model.ts`, `src/core/solve.ts`
- Test: `tests/core/model.test.ts`

The variables are spec §6.1 (all 0/1, named compactly: `s_p_d_m` means person p works the morning shift on day d). `p` indexes the active people, and `d` indexes the open days. The strict rules are spec §6.2 line by line; each `milp.constrain` carries the spec's wording as a comment.

`solve` runs the stages in order. Each stage minimises its objective, then adds `objective ≤ optimum` as a row, so the next stage only chooses among rosters tied on everything before it. Stages with an empty objective are skipped. Right now only holes and substitutions have one; Tasks 7 and 8 fill in the rest. Integral stages bound at `Math.round(optimum)`, and fractional ones at `optimum + 1e-6`. `decode` turns the solution columns into assignments and holes.

- [ ] **Step 1: Write the failing test**

`tests/core/model.test.ts`:

```ts
import loadHighs from 'highs'
import { describe, expect, it } from 'vitest'
import { TEST_META, consecutiveDays, makeInput } from './fixtures'
import { solve } from '../../src/core/solve'
import type { SolveInput } from '../../src/core/types'
import { validateRoster } from '../../src/core/validate'

const highs = await loadHighs()
const D = '2026-10-26'

function solveValid(input: SolveInput) {
  const roster = solve(input, highs, TEST_META)
  expect(validateRoster(input, roster)).toEqual([])
  return roster
}

describe('strict rules', () => {
  it('fills every seat when capacity allows', () => {
    const roster = solveValid(makeInput({ teachers: 4, nannies: 3, groups: 2 }))
    expect(roster.holes).toEqual([])
    expect(roster.assignments.some((a) => a.substitution)).toBe(false)
    expect(roster.assignments).toHaveLength(7 * 5)
  })

  it('leaves the absent out', () => {
    const input = makeInput({ teachers: 4, nannies: 3, groups: 2, absent: { t1: [D], n2: [D] } })
    const roster = solveValid(input)
    expect(roster.assignments.filter((a) => a.date === D)).toHaveLength(5)
  })

  it('leaves a teacher seat empty rather than break a rule', () => {
    const roster = solveValid(makeInput({ teachers: 3, nannies: 2, groups: 2, days: [D] }))
    expect(roster.holes).toEqual([
      { kind: 'teacherSeat', date: D, group: expect.any(Number), shift: expect.any(String) },
    ])
  })

  it('puts a teacher in a nanny seat only when the nannies run out', () => {
    const roster = solveValid(makeInput({ teachers: 5, nannies: 1, groups: 2, days: [D] }))
    expect(roster.assignments.filter((a) => a.substitution)).toHaveLength(1)
    expect(roster.holes.filter((h) => h.kind === 'teacherSeat')).toEqual([])
  })

  it('lets a lone nanny cover one key', () => {
    const roster = solveValid(makeInput({ teachers: 2, nannies: 1, groups: 1, days: [D] }))
    expect(roster.holes.filter((h) => h.kind !== 'teacherSeat')).toHaveLength(1)
  })

  it('starts only the groups the day can staff', () => {
    const roster = solveValid(makeInput({ teachers: 3, nannies: 1, groups: 3, days: [D] }))
    expect(roster.groupsPerDay[D]).toBe(2)
  })

  it('keeps a closed day empty', () => {
    const [mon, tue] = consecutiveDays(D, 2)
    const roster = solveValid(
      makeInput({ teachers: 4, nannies: 2, groups: 2, days: [mon, tue], overrides: { [tue]: 0 } }),
    )
    expect(roster.assignments.filter((a) => a.date === tue)).toEqual([])
    expect(roster.groupsPerDay[tue]).toBe(0)
  })

  it('lets nannies open and close on a day without teachers', () => {
    const input = makeInput({
      teachers: 2,
      nannies: 2,
      groups: 1,
      days: [D],
      absent: { t1: [D], t2: [D] },
    })
    const roster = solveValid(input)
    expect(roster.groupsPerDay[D]).toBe(0)
    expect(roster.holes).toEqual([])
  })

  it('never lets a nanny open, or close, on every day', () => {
    const roster = solveValid(
      makeInput({ teachers: 2, nannies: 2, groups: 1, days: consecutiveDays(D, 3) }),
    )
    for (const id of ['n1', 'n2']) {
      expect(roster.assignments.filter((a) => a.staffId === id && a.opener).length).toBeLessThan(3)
      expect(roster.assignments.filter((a) => a.staffId === id && a.closer).length).toBeLessThan(3)
    }
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/core/model.test.ts`

Expected: FAIL — `Cannot find module '../../src/core/solve'`.

- [ ] **Step 3: Implement the model**

`src/core/model.ts`. The objectives for all six stages exist from the start; fairness, switches and turnarounds stay empty until Tasks 7–8.

```ts
import { dayCapacities, type DayCapacity } from './capacity'
import { Lin, Milp } from './lp'
import { SHIFTS, type Shift, type SolveInput, type Staff } from './types'

/** Solve stages in strict priority order (spec §6.5). */
export const STAGES = [
  'holes',
  'substitutions',
  'worstGap',
  'totalGap',
  'switches',
  'turnarounds',
] as const
export type Stage = (typeof STAGES)[number]

/** Stages whose objective counts binaries, so the optimum is a whole number. */
export const INTEGRAL_STAGES: ReadonlySet<Stage> = new Set([
  'holes',
  'substitutions',
  'switches',
  'turnarounds',
])

/** Variable names. p indexes `people`, d indexes `days`, g is the group number (from 1). */
export const v = {
  shift: (p: number, d: number, t: Shift) => `s_${p}_${d}_${t[0]}`,
  teacherSeat: (p: number, d: number, g: number, t: Shift) => `x_${p}_${d}_${g}_${t[0]}`,
  nannySeat: (p: number, d: number, g: number) => `n_${p}_${d}_${g}`,
  substitution: (p: number, d: number, g: number) => `u_${p}_${d}_${g}`,
  open: (p: number, d: number) => `o_${p}_${d}`,
  close: (p: number, d: number) => `c_${p}_${d}`,
  holeTeacher: (d: number, g: number, t: Shift) => `ht_${d}_${g}_${t[0]}`,
  holeOpen: (d: number) => `ho_${d}`,
  holeClose: (d: number) => `hc_${d}`,
}

/** An open (not closed) day of the period. `present` holds indexes into `people`. */
export type ModelDay = { index: number; date: string; groups: number; present: number[] }

export type RosterModel = {
  milp: Milp
  objectives: Record<Stage, Lin>
  people: Staff[]
  days: ModelDay[]
  capacities: DayCapacity[]
}

export function groupNumbers(groups: number): number[] {
  return Array.from({ length: groups }, (_, i) => i + 1)
}

export function buildModel(input: SolveInput): RosterModel {
  const capacities = dayCapacities(input)
  const people = input.staff.filter((s) => s.active)
  const absent = new Set(input.absences.map((a) => `${a.staffId}|${a.date}`))
  const days: ModelDay[] = capacities
    .filter((c) => !c.closed)
    .map((c, index) => ({
      index,
      date: c.date,
      groups: c.groups,
      present: people.flatMap((s, p) => (absent.has(`${s.id}|${c.date}`) ? [] : [p])),
    }))

  const milp = new Milp()
  const objectives = Object.fromEntries(STAGES.map((stage) => [stage, new Lin()])) as Record<
    Stage,
    Lin
  >
  const isTeacher = (p: number) => people[p].role === 'teacher'
  const isPresent = (p: number, day: ModelDay) => day.present.includes(p)

  // Seat variables per day and person: all of them, and per group.
  const seats = days.map(() => people.map(() => new Lin()))
  const groupSeats = days.map(() => people.map(() => new Map<number, Lin>()))
  const inGroup = (d: number, p: number, g: number): Lin => {
    const lin = groupSeats[d][p].get(g) ?? new Lin()
    groupSeats[d][p].set(g, lin)
    return lin
  }
  const seat = (name: string, d: number, p: number, g: number) => {
    milp.binary(name)
    seats[d][p].add(name)
    inGroup(d, p, g).add(name)
    return name
  }

  // ── Strict rules (§6.2) ───────────────────────────────────────────────────
  for (const day of days) {
    const d = day.index
    const groups = groupNumbers(day.groups)
    const teachers = day.present.filter(isTeacher)
    const nannies = day.present.filter((p) => !isTeacher(p))
    // A substitution only ever fills a nanny seat no nanny can take.
    const substitutes = nannies.length < day.groups ? teachers : []

    for (const p of day.present) {
      const shifts = Lin.sum(SHIFTS.map((t) => milp.binary(v.shift(p, d, t))))
      milp.constrain(shifts, '=', 1) // present ⇒ exactly one shift
    }
    for (const p of teachers) {
      for (const t of SHIFTS) {
        const onShift = Lin.sum(groups.map((g) => seat(v.teacherSeat(p, d, g, t), d, p, g)))
        milp.constrain(onShift, '<=', new Lin().add(v.shift(p, d, t))) // teacher seat only on own shift
      }
    }
    for (const p of substitutes) {
      for (const g of groups) objectives.substitutions.add(seat(v.substitution(p, d, g), d, p, g))
    }
    for (const p of nannies) {
      for (const g of groups) seat(v.nannySeat(p, d, g), d, p, g)
      const open = milp.binary(v.open(p, d))
      const close = milp.binary(v.close(p, d))
      milp.constrain(new Lin().add(open), '<=', new Lin().add(v.shift(p, d, 'morning')))
      milp.constrain(new Lin().add(close), '<=', new Lin().add(v.shift(p, d, 'afternoon')))
    }
    for (const p of day.present) {
      if (!seats[d][p].isEmpty()) milp.constrain(seats[d][p], '<=', 1) // at most one seat a day
    }

    for (const g of groups) {
      for (const t of SHIFTS) {
        const hole = milp.binary(v.holeTeacher(d, g, t))
        objectives.holes.add(hole)
        const filled = Lin.sum(teachers.map((p) => v.teacherSeat(p, d, g, t))).add(hole)
        milp.constrain(filled, '=', 1) // each teacher seat: a person or a hole
      }
      const bothEmpty = Lin.sum(SHIFTS.map((t) => v.holeTeacher(d, g, t)))
      milp.constrain(bothEmpty, '<=', 1) // group minimum: ≥ 1 teacher
      const nannySeat = Lin.sum([
        ...nannies.map((p) => v.nannySeat(p, d, g)),
        ...substitutes.map((p) => v.substitution(p, d, g)),
      ])
      milp.constrain(nannySeat, '=', 1) // nanny seat always filled
    }

    const holeOpen = milp.binary(v.holeOpen(d))
    const holeClose = milp.binary(v.holeClose(d))
    objectives.holes.add(holeOpen).add(holeClose)
    milp.constrain(Lin.sum(nannies.map((p) => v.open(p, d))).add(holeOpen), '=', 1)
    milp.constrain(Lin.sum(nannies.map((p) => v.close(p, d))).add(holeClose), '=', 1)
  }

  // Nobody opens, or closes, on every working day of the period.
  if (days.length >= 2) {
    people.forEach((person, p) => {
      if (person.role !== 'nanny' || !days.every((day) => isPresent(p, day))) return
      milp.constrain(Lin.sum(days.map((day) => v.open(p, day.index))), '<=', days.length - 1)
      milp.constrain(Lin.sum(days.map((day) => v.close(p, day.index))), '<=', days.length - 1)
    })
  }

  return { milp, objectives, people, days, capacities }
}
```

- [ ] **Step 4: Implement the staged solve**

`src/core/solve.ts`. For now every stage must prove its optimum; Task 9 adds the time budget.

```ts
import type { LegacyHighs } from 'highs'
import { toLpText, type Row } from './lp'
import {
  INTEGRAL_STAGES,
  STAGES,
  buildModel,
  groupNumbers,
  v,
  type RosterModel,
  type Stage,
} from './model'
import {
  SHIFTS,
  type Assignment,
  type Hole,
  type Roster,
  type RosterMeta,
  type SolveInput,
} from './types'

/** The part of the `highs` module the solver needs; tests may pass a stub. */
export type LpSolver = Pick<LegacyHighs, 'solve'>

/** Fixed seed and proven optima at every stage: the same input gives the same roster. */
export const HIGHS_OPTIONS = { random_seed: 0, mip_rel_gap: 0, output_flag: false } as const

/** Slack when a fractional optimum becomes the next stage's bound; far below any real difference. */
const TOLERANCE = 1e-6

export class SolveError extends Error {
  constructor(
    readonly stage: Stage,
    readonly status: string,
  ) {
    super(`Solver stage "${stage}" ended with status "${status}"`)
    this.name = 'SolveError'
  }
}

type Columns = Record<string, { Primal?: number }>

/**
 * Staged solve (§6.5): each stage's optimum becomes a bound for the next, so a
 * later stage only chooses among rosters tied on every earlier one.
 */
export function solve(input: SolveInput, highs: LpSolver, meta: RosterMeta): Roster {
  const model = buildModel(input)
  const bounds: Row[] = []
  let columns: Columns | undefined
  for (const stage of STAGES) {
    const objective = model.objectives[stage]
    if (objective.isEmpty()) continue
    const lp = toLpText(model.milp, objective, bounds)
    const result = highs.solve(lp, HIGHS_OPTIONS)
    if (result.Status !== 'Optimal') throw new SolveError(stage, result.Status)
    columns = result.Columns
    const optimum = result.ObjectiveValue
    const rhs = INTEGRAL_STAGES.has(stage) ? Math.round(optimum) : optimum + TOLERANCE
    bounds.push({ terms: objective.terms, op: '<=', rhs })
  }
  return decode(input, model, columns ?? {}, meta)
}

function decode(input: SolveInput, model: RosterModel, columns: Columns, meta: RosterMeta): Roster {
  const on = (name: string) => (columns[name]?.Primal ?? 0) > 0.5
  const assignments: Assignment[] = []
  const holes: Hole[] = []
  for (const day of model.days) {
    const d = day.index
    const groups = groupNumbers(day.groups)
    for (const p of day.present) {
      const assignment: Assignment = {
        staffId: model.people[p].id,
        date: day.date,
        shift: on(v.shift(p, d, 'morning')) ? 'morning' : 'afternoon',
      }
      for (const g of groups) {
        for (const t of SHIFTS) {
          if (on(v.teacherSeat(p, d, g, t)))
            assignment.seat = { kind: 'teacher', group: g, shift: t }
        }
        if (on(v.nannySeat(p, d, g))) assignment.seat = { kind: 'nanny', group: g }
        if (on(v.substitution(p, d, g))) {
          assignment.seat = { kind: 'nanny', group: g }
          assignment.substitution = true
        }
      }
      if (on(v.open(p, d))) assignment.opener = true
      if (on(v.close(p, d))) assignment.closer = true
      assignments.push(assignment)
    }
    for (const g of groups) {
      for (const t of SHIFTS) {
        if (on(v.holeTeacher(d, g, t))) {
          holes.push({ kind: 'teacherSeat', date: day.date, group: g, shift: t })
        }
      }
    }
    if (on(v.holeOpen(d))) holes.push({ kind: 'opener', date: day.date })
    if (on(v.holeClose(d))) holes.push({ kind: 'closer', date: day.date })
  }
  return {
    period: input.period,
    groupsPerDay: Object.fromEntries(model.capacities.map((c) => [c.date, c.groups])),
    assignments,
    holes,
    warnings: [],
    ...meta,
  }
}
```

- [ ] **Step 5: Run it to verify it passes**

Run: `npx vitest run tests/core/model.test.ts && npm run typecheck`

Expected: PASS (9 tests).

- [ ] **Step 6: Commit**

```bash
git add src/core/model.ts src/core/solve.ts tests/core/model.test.ts
git commit -m "feat(core): model the strict rules and solve in stages with HiGHS"
```

---

### Task 7: Fairness — balanced mornings, keys and reserve days

**Files:**
- Create: `src/core/fairness.ts`
- Modify: `src/core/model.ts`
- Test: `tests/core/fairness.test.ts`

Spec §6.3 balances four counts per person: morning shifts, opener days, closer days and reserve days. Each count has a fair share scaled by the days that person actually works (Improvement 1):

- mornings: `w / 2`, where `w` is the person's working days in the period;
- reserve days: the role's reserve days, split by share of the role's working days. Per open day the role has `T − substitutes − 2G` spare teachers or `N − G` spare nannies;
- opener and closer: the key days (open days with at least two nannies, Improvement 5), split among nannies by their key days.

The model adds `den · gap ≥ ±(den · count − num)`, a whole-number floor per gap, and `worst ≥ gap` for every gap. Stage 3 minimises `worst`; stage 4 minimises the sum of the gaps. `worstGapFloor` also bounds `worst` from below (Improvement 2). The spec's own example, "4 nannies, one working 3 of 5 days → she opens once", is a test here.

- [ ] **Step 1: Write the failing test**

`tests/core/fairness.test.ts`:

```ts
import loadHighs from 'highs'
import { describe, expect, it } from 'vitest'
import { apportionmentFloor, fairShares, gapOf, worstGapFloor } from '../../src/core/fairness'
import { TEST_META, consecutiveDays, makeInput } from './fixtures'
import { solve } from '../../src/core/solve'
import { validateRoster } from '../../src/core/validate'

const highs = await loadHighs()
const WEEK = consecutiveDays('2026-10-26', 5)

describe('fairShares', () => {
  it('splits mornings, reserve days and keys by days worked', () => {
    const input = makeInput({ teachers: 3, nannies: 3, groups: 1, days: WEEK.slice(0, 2) })
    const share = (staffId: string, kind: string) =>
      fairShares(input).find((s) => s.staffId === staffId && s.kind === kind)
    expect(share('t1', 'morning')).toMatchObject({ num: 2, den: 2 })
    // Each day one of three teachers is spare: 2 reserve days over 6 teacher-days.
    expect(share('t1', 'reserve')).toMatchObject({ num: 4, den: 6, pool: 'reserve:teacher' })
    // Each day two of three nannies are spare: 4 reserve days over 6 nanny-days.
    expect(share('n1', 'reserve')).toMatchObject({ num: 8, den: 6 })
    expect(share('n1', 'opener')).toMatchObject({ num: 4, den: 6, pool: 'opener' })
    expect(share('t1', 'opener')).toBeUndefined()
  })

  it('leaves days with a lone nanny out of the key balance', () => {
    const input = makeInput({
      teachers: 2,
      nannies: 2,
      groups: 1,
      days: WEEK.slice(0, 2),
      absent: { n2: [WEEK[0]] },
    })
    const opener = fairShares(input).find((s) => s.staffId === 'n1' && s.kind === 'opener')
    expect(opener?.days).toEqual([WEEK[1]])
  })
})

describe('floors', () => {
  it('deals out whole counts: 15 reserve days among 7 nannies leave someone 6/7 off', () => {
    expect(apportionmentFloor(Array(7).fill(75), 35)).toBeCloseTo(6 / 7)
    expect(apportionmentFloor([4, 4, 4], 6)).toBeCloseTo(2 / 3)
    expect(apportionmentFloor([6, 6], 6)).toBe(0)
  })

  it('is at least a half when someone works an odd number of days', () => {
    const input = makeInput({ teachers: 2, nannies: 2, groups: 1, days: WEEK.slice(0, 3) })
    expect(worstGapFloor(fairShares(input))).toBeGreaterThanOrEqual(0.5)
  })
})

describe('the solver balances', () => {
  it('gives a nanny working 3 of 5 days one opening (spec §11)', () => {
    const input = makeInput({
      teachers: 4,
      nannies: 4,
      groups: 2,
      absent: { n4: [WEEK[2], WEEK[3]] },
    })
    const roster = solve(input, highs, TEST_META)
    expect(validateRoster(input, roster)).toEqual([])
    expect(roster.assignments.filter((a) => a.staffId === 'n4' && a.opener)).toHaveLength(1)
  })

  it('splits mornings evenly and keeps every gap under one', () => {
    const input = makeInput({ teachers: 4, nannies: 3, groups: 2, days: WEEK.slice(0, 4) })
    const roster = solve(input, highs, TEST_META)
    for (const id of ['t1', 't2', 't3', 't4', 'n1', 'n2', 'n3']) {
      expect(
        roster.assignments.filter((a) => a.staffId === id && a.shift === 'morning'),
      ).toHaveLength(2)
    }
    for (const share of fairShares(input)) expect(gapOf(share, roster)).toBeLessThan(1)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/core/fairness.test.ts`

Expected: FAIL — `Cannot find module '../../src/core/fairness'`.

- [ ] **Step 3: Implement the shares and floors**

`src/core/fairness.ts`:

```ts
import { dayCapacities } from './capacity'
import type { Assignment, Roster, SolveInput } from './types'

export type GapKind = 'morning' | 'opener' | 'closer' | 'reserve'

/**
 * A fair share (spec §6.3): over `days`, `staffId`'s count of `kind` should be
 * `num / den`. Shares with the same `pool` deal out a fixed whole total.
 */
export type Share = {
  staffId: string
  kind: GapKind
  days: string[]
  num: number
  den: number
  pool?: string
}

/**
 * Every share for a period. Once holes and substitutions are minimal (stages 1–2)
 * each total is fixed by capacity, so the shares are constants.
 */
export function fairShares(input: SolveInput): Share[] {
  const open = dayCapacities(input).filter((c) => !c.closed)
  const absent = new Set(input.absences.map((a) => `${a.staffId}|${a.date}`))
  const people = input.staff.filter((s) => s.active)
  const presentOn = (staffId: string, dates: string[]) =>
    dates.filter((date) => !absent.has(`${staffId}|${date}`))
  const openDays = open.map((c) => c.date)
  const shares: Share[] = []

  // Morning shifts: half of the days worked.
  for (const person of people) {
    const days = presentOn(person.id, openDays)
    if (days.length > 0)
      shares.push({ staffId: person.id, kind: 'morning', days, num: days.length, den: 2 })
  }

  // Reserve days: the role's reserve days, split by share of the role's working days.
  for (const role of ['teacher', 'nanny'] as const) {
    let pool = 0
    for (const c of open) {
      const substitutes = Math.max(0, c.groups - c.nannies)
      pool +=
        role === 'teacher'
          ? Math.max(0, c.teachers - substitutes - 2 * c.groups)
          : Math.max(0, c.nannies - c.groups)
    }
    const members = people
      .filter((s) => s.role === role)
      .map((s) => ({ staffId: s.id, days: presentOn(s.id, openDays) }))
      .filter((m) => m.days.length > 0)
    const roleDays = members.reduce((sum, m) => sum + m.days.length, 0)
    for (const { staffId, days } of members) {
      shares.push({
        staffId,
        kind: 'reserve',
        days,
        num: pool * days.length,
        den: roleDays,
        pool: `reserve:${role}`,
      })
    }
  }

  // Opener and closer days, on days with two or more nannies: a lone nanny's key is forced.
  const keyDays = open.filter((c) => c.nannies >= 2).map((c) => c.date)
  const holders = people
    .filter((s) => s.role === 'nanny')
    .map((s) => ({ staffId: s.id, days: presentOn(s.id, keyDays) }))
    .filter((m) => m.days.length > 0)
  const holderDays = holders.reduce((sum, m) => sum + m.days.length, 0)
  for (const kind of ['opener', 'closer'] as const) {
    for (const { staffId, days } of holders) {
      shares.push({
        staffId,
        kind,
        days,
        num: keyDays.length * days.length,
        den: holderDays,
        pool: kind,
      })
    }
  }
  return shares
}

const counts: Record<GapKind, (a: Assignment) => boolean> = {
  morning: (a) => a.shift === 'morning',
  opener: (a) => a.opener === true,
  closer: (a) => a.closer === true,
  reserve: (a) => a.seat === undefined,
}

export function countFor(share: Share, roster: Roster): number {
  const days = new Set(share.days)
  return roster.assignments.filter(
    (a) => a.staffId === share.staffId && days.has(a.date) && counts[share.kind](a),
  ).length
}

export function gapOf(share: Share, roster: Roster): number {
  return Math.abs(countFor(share, roster) - share.num / share.den)
}

/**
 * Shares `nums[i] / den` add up to a whole total that must be dealt out in whole
 * counts. Returns the smallest possible largest |count − share|: round up the
 * shares with the largest fractions, round the rest down.
 */
export function apportionmentFloor(nums: number[], den: number): number {
  const remainders = nums.map((num) => num % den).sort((a, b) => b - a)
  const roundUp = remainders.reduce((sum, r) => sum + r, 0) / den
  let worst = 0
  remainders.forEach((r, i) => {
    worst = Math.max(worst, i < roundUp ? den - r : r)
  })
  return worst / den
}

/** A lower bound on the worst gap any roster can reach: stage 3 may stop as soon as it gets there. */
export function worstGapFloor(shares: Share[]): number {
  let floor = 0
  const pools = new Map<string, Share[]>()
  for (const share of shares) {
    const r = share.num % share.den
    floor = Math.max(floor, Math.min(r, share.den - r) / share.den)
    if (share.pool) pools.set(share.pool, [...(pools.get(share.pool) ?? []), share])
  }
  for (const members of pools.values()) {
    floor = Math.max(
      floor,
      apportionmentFloor(
        members.map((m) => m.num),
        members[0].den,
      ),
    )
  }
  return floor
}
```

- [ ] **Step 4: Add the fairness rows to the model**

In `src/core/model.ts`, add above the line `import { Lin, Milp } from './lp'`:

```ts
import { fairShares, worstGapFloor, type GapKind } from './fairness'
```

In `src/core/model.ts`, add below the line `` holeClose: (d: number) => `hc_${d}`, ``:

```ts
  gap: (kind: GapKind, p: number) => `g${kind[0]}_${p}`,
  worstGap: 'worst',
```

In `src/core/model.ts`, add above the line `return { milp, objectives, people, days, capacities }`:

```ts
  // ── Fairness (§6.3): |count − share| ≤ gap, rows scaled by `den` ─────────
  const shares = fairShares(input)
  const worst = milp.nonNegative(v.worstGap)
  objectives.worstGap.add(worst)
  const indexOf = new Map(people.map((s, p) => [s.id, p]))
  const dayIndex = new Map(days.map((day) => [day.date, day.index]))
  for (const share of shares) {
    const p = indexOf.get(share.staffId)!
    const ds = share.days.map((date) => dayIndex.get(date)!)
    const count =
      share.kind === 'morning'
        ? Lin.sum(ds.map((d) => v.shift(p, d, 'morning')))
        : share.kind === 'opener'
          ? Lin.sum(ds.map((d) => v.open(p, d)))
          : share.kind === 'closer'
            ? Lin.sum(ds.map((d) => v.close(p, d)))
            : ds.reduce((reserve, d) => reserve.plus(seats[d][p], -1), Lin.constant(ds.length))
    const gap = milp.nonNegative(v.gap(share.kind, p))
    const scaled = new Lin().add(gap, share.den)
    milp.constrain(scaled, '>=', new Lin().plus(count, share.den).addConstant(-share.num))
    milp.constrain(scaled, '>=', new Lin().plus(count, -share.den).addConstant(share.num))
    // A whole count is never closer to its share than the share is to a whole number.
    const r = share.num % share.den
    if (r !== 0) milp.constrain(scaled, '>=', Math.min(r, share.den - r))
    milp.constrain(new Lin().add(worst), '>=', new Lin().add(gap))
    objectives.totalGap.add(gap)
  }
  // Without this floor HiGHS can take seconds to prove what counting shows at once.
  const floor = worstGapFloor(shares)
  if (floor > 0) milp.constrain(new Lin().add(worst), '>=', floor)
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/core/fairness.test.ts tests/core/model.test.ts && npm run typecheck`

Expected: PASS (15 tests).

- [ ] **Step 6: Commit**

```bash
git add src/core/fairness.ts tests/core/fairness.test.ts src/core/model.ts
git commit -m "feat(core): balance mornings, keys and reserve days by fair shares"
```

---

### Task 8: Group switches and turnarounds

**Files:**
- Create: `src/core/metrics.ts`
- Modify: `src/core/model.ts`
- Test: `tests/core/switches.test.ts`

Spec §6.4. A **switch**: someone seated in group g today and in another group on the next open day. `sw ≥ inGroup_g(today) + seated(tomorrow) − inGroup_g(tomorrow) − 1` for each g. A reserve day breaks the chain, so the model never rewards parking people in reserve. A **turnaround**: a nanny on the afternoon shift (until 18:00), then on the morning shift the next calendar day (from 6:00). `sw` and `tu` are continuous and ≥ 0; minimisation pins them to 0 or 1. `metrics.ts` counts both on a finished roster. `explain` (Phase 1) reuses it, and so does the slice summary.

- [ ] **Step 1: Write the failing test**

`tests/core/switches.test.ts`:

```ts
import loadHighs from 'highs'
import { describe, expect, it } from 'vitest'
import { TEST_META, consecutiveDays, makeInput } from './fixtures'
import { groupSwitches, turnarounds } from '../../src/core/metrics'
import { solve } from '../../src/core/solve'
import type { Assignment, Roster, Seat, SolveInput } from '../../src/core/types'
import { validateRoster } from '../../src/core/validate'

const highs = await loadHighs()
const [MON, TUE, WED] = consecutiveDays('2026-10-26', 3)

function rosterOf(input: SolveInput, assignments: Assignment[]): Roster {
  return {
    period: input.period,
    groupsPerDay: {},
    assignments,
    holes: [],
    warnings: [],
    ...TEST_META,
  }
}

const seat = (group: number): Seat => ({ kind: 'nanny', group })
const work = (
  date: string,
  where?: number,
  shift: Assignment['shift'] = 'morning',
): Assignment => ({
  staffId: 'n1',
  date,
  shift,
  ...(where ? { seat: seat(where) } : {}),
})

describe('groupSwitches — the switch table', () => {
  const input = makeInput({ teachers: 0, nannies: 1, groups: 2, days: [MON, TUE, WED] })
  it.each([
    ['same group', [work(MON, 1), work(TUE, 1)], 0],
    ['another group', [work(MON, 1), work(TUE, 2)], 1],
    ['group, then reserve', [work(MON, 1), work(TUE)], 0],
    ['reserve breaks the chain', [work(MON, 1), work(TUE), work(WED, 2)], 0],
    ['absent breaks the chain', [work(MON, 1), work(WED, 2)], 0],
    ['each move counts', [work(MON, 1), work(TUE, 2), work(WED, 1)], 2],
  ])('%s', (_, assignments, switches) => {
    expect(groupSwitches(input, rosterOf(input, assignments))).toHaveLength(switches)
  })

  it('chains across a closed day', () => {
    const closed = makeInput({
      teachers: 0,
      nannies: 1,
      groups: 2,
      days: [MON, TUE, WED],
      overrides: { [TUE]: 0 },
    })
    expect(groupSwitches(closed, rosterOf(closed, [work(MON, 1), work(WED, 2)]))).toHaveLength(1)
  })
})

describe('turnarounds', () => {
  it('counts a nanny from 18:00 to 6:00 on the next calendar day only', () => {
    const input = makeInput({
      teachers: 0,
      nannies: 1,
      groups: 1,
      days: ['2026-10-30', '2026-11-02', '2026-11-03'],
    })
    const roster = rosterOf(input, [
      { staffId: 'n1', date: '2026-10-30', shift: 'afternoon' },
      { staffId: 'n1', date: '2026-11-02', shift: 'afternoon' },
      { staffId: 'n1', date: '2026-11-03', shift: 'morning' },
    ])
    expect(turnarounds(input, roster)).toEqual([
      { staffId: 'n1', late: '2026-11-02', early: '2026-11-03' },
    ])
  })
})

describe('the solver keeps people in place', () => {
  it('finds a week without group switches when one exists', () => {
    const input = makeInput({ teachers: 4, nannies: 3, groups: 2 })
    const roster = solve(input, highs, TEST_META)
    expect(validateRoster(input, roster)).toEqual([])
    expect(groupSwitches(input, roster)).toEqual([])
  })

  // Fairness outranks comfort: whoever closes on Monday must open later to balance
  // her mornings, so a short week often keeps one turnaround.
  it('accepts the one turnaround two nannies cannot avoid', () => {
    const input = makeInput({ teachers: 2, nannies: 2, groups: 1, days: [MON, TUE] })
    expect(turnarounds(input, solve(input, highs, TEST_META))).toHaveLength(1)
  })

  it('does not count a weekend in between', () => {
    const input = makeInput({
      teachers: 2,
      nannies: 2,
      groups: 1,
      days: ['2026-10-30', '2026-11-02'],
    })
    expect(turnarounds(input, solve(input, highs, TEST_META))).toEqual([])
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/core/switches.test.ts`

Expected: FAIL — `Cannot find module '../../src/core/metrics'`.

- [ ] **Step 3: Implement the metrics**

`src/core/metrics.ts`:

```ts
import { addDays } from './calendar'
import type { Assignment, Roster, SolveInput } from './types'

export type GroupSwitch = {
  staffId: string
  from: string
  to: string
  fromGroup: number
  toGroup: number
}
export type Turnaround = { staffId: string; late: string; early: string }

/** Days the kindergarten is open: every period day except those she set to 0 groups. */
function openDays(input: SolveInput, roster: Roster): string[] {
  const closed = new Set(input.dayPlans.filter((p) => p.override === 0).map((p) => p.date))
  return roster.period.days.filter((date) => !closed.has(date))
}

function byPersonAndDay(roster: Roster): Map<string, Assignment> {
  return new Map(roster.assignments.map((a) => [`${a.staffId}|${a.date}`, a]))
}

/** Someone seated in one group and, on the next open day, seated in another (§6.4). */
export function groupSwitches(input: SolveInput, roster: Roster): GroupSwitch[] {
  const days = openDays(input, roster)
  const at = byPersonAndDay(roster)
  const out: GroupSwitch[] = []
  for (let i = 0; i + 1 < days.length; i++) {
    for (const person of input.staff) {
      const today = at.get(`${person.id}|${days[i]}`)?.seat
      const tomorrow = at.get(`${person.id}|${days[i + 1]}`)?.seat
      if (today && tomorrow && today.group !== tomorrow.group) {
        out.push({
          staffId: person.id,
          from: days[i],
          to: days[i + 1],
          fromGroup: today.group,
          toGroup: tomorrow.group,
        })
      }
    }
  }
  return out
}

/** A nanny working until 18:00 and from 6:00 the next calendar day. */
export function turnarounds(input: SolveInput, roster: Roster): Turnaround[] {
  const at = byPersonAndDay(roster)
  const out: Turnaround[] = []
  for (const person of input.staff.filter((s) => s.role === 'nanny')) {
    for (const late of roster.period.days) {
      const early = addDays(late, 1)
      if (
        at.get(`${person.id}|${late}`)?.shift === 'afternoon' &&
        at.get(`${person.id}|${early}`)?.shift === 'morning'
      ) {
        out.push({ staffId: person.id, late, early })
      }
    }
  }
  return out
}
```

- [ ] **Step 4: Add switches and turnarounds to the model**

In `src/core/model.ts`, add above the line `import { dayCapacities, type DayCapacity } from './capacity'`:

```ts
import { addDays } from './calendar'
```

In `src/core/model.ts`, add below the line `worstGap: 'worst',`:

```ts
  switch: (p: number, d: number) => `sw_${p}_${d}`,
  turnaround: (p: number, d: number) => `tu_${p}_${d}`,
```

In `src/core/model.ts`, add above the line `return { milp, objectives, people, days, capacities }`:

```ts
  // ── Group switches and turnarounds (§6.4) ─────────────────────────────────
  for (let i = 0; i + 1 < days.length; i++) {
    const today = days[i]
    const tomorrow = days[i + 1]
    const nextCalendarDay = addDays(today.date, 1) === tomorrow.date
    for (const p of today.present) {
      if (!isPresent(p, tomorrow)) continue
      if (today.groups > 0 && tomorrow.groups > 0) {
        // switch ≥ inGroup_g(today) + inAnyGroup(tomorrow) − inGroup_g(tomorrow) − 1
        const sw = milp.nonNegative(v.switch(p, today.index))
        objectives.switches.add(sw)
        for (const g of groupNumbers(today.groups)) {
          const moved = new Lin()
            .plus(inGroup(today.index, p, g))
            .plus(seats[tomorrow.index][p])
            .plus(inGroup(tomorrow.index, p, g), -1)
            .addConstant(-1)
          milp.constrain(new Lin().add(sw), '>=', moved)
        }
      }
      if (nextCalendarDay && !isTeacher(p)) {
        // A nanny closing at 18:00 and opening at 6:00 the next day.
        const tu = milp.nonNegative(v.turnaround(p, today.index))
        objectives.turnarounds.add(tu)
        const late = new Lin()
          .add(v.shift(p, today.index, 'afternoon'))
          .add(v.shift(p, tomorrow.index, 'morning'))
          .addConstant(-1)
        milp.constrain(new Lin().add(tu), '>=', late)
      }
    }
  }
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/core/switches.test.ts tests/core/fairness.test.ts tests/core/model.test.ts && npm run typecheck`

Expected: PASS (26 tests).

- [ ] **Step 6: Commit**

```bash
git add src/core/metrics.ts tests/core/switches.test.ts src/core/model.ts
git commit -m "feat(core): keep people in their group and avoid turnarounds"
```

---

### Task 9: A time budget per stage, and determinism

**Files:**
- Modify: `src/core/solve.ts`
- Test: `tests/core/solve.test.ts`

Improvement 3. Each stage gets `time_limit: 4` seconds. If a stage stops on its limit with a roster in hand, that roster is kept and the later stages are skipped; otherwise the previous stage's roster stands. Check the objective, not the columns: a stage stopped before finding any roster reports an infinite objective, yet HiGHS still puts a number in every column. A 300-seed property run caught that on a loaded machine. The only failure left is a first stage with no solution at all, which throws `SolveError`. Use only `time_limit`: highs 1.15.3's status map has no name for the node-limit status, so don't use node limits. HiGHS runs with `random_seed: 0`, which makes the roster reproducible.

- [ ] **Step 1: Write the failing test**

`tests/core/solve.test.ts`. The stubs stand in for a slow solver, one that stops before finding anything (as real HiGHS reports it), and a broken one.

```ts
import loadHighs from 'highs'
import { describe, expect, it } from 'vitest'
import { TEST_META, makeInput, randomInput } from './fixtures'
import { SolveError, solve, type LpSolver } from '../../src/core/solve'
import { validateRoster } from '../../src/core/validate'

const highs = await loadHighs()

describe('solve', () => {
  it('gives the same roster for the same input', () => {
    const input = randomInput(7)
    expect(solve(input, highs, TEST_META)).toEqual(solve(input, highs, TEST_META))
  })

  it('returns an empty roster when every day is closed', () => {
    const input = makeInput({
      teachers: 2,
      nannies: 2,
      groups: 1,
      overrides: { '2026-10-26': 0 },
      days: ['2026-10-26'],
    })
    const roster = solve(input, highs, TEST_META)
    expect(roster.assignments).toEqual([])
    expect(roster.groupsPerDay).toEqual({ '2026-10-26': 0 })
  })

  it('keeps the best roster so far when a later stage runs out of time', () => {
    let calls = 0
    const slow: LpSolver = {
      solve: (lp, options) => {
        calls += 1
        if (calls === 3)
          return { Status: 'Time limit reached', ObjectiveValue: 0, Columns: {}, Rows: [] }
        return highs.solve(lp, options)
      },
    }
    const input = makeInput({ teachers: 4, nannies: 3, groups: 2 })
    const roster = solve(input, slow, TEST_META)
    expect(calls).toBe(3)
    expect(validateRoster(input, roster)).toEqual([])
  })

  it('ignores a stage that ran out of time before finding any roster', () => {
    // Real HiGHS then reports an infinite objective, yet still puts a number in every column.
    let calls = 0
    const empty: LpSolver = {
      solve: (lp, options) => {
        const result = highs.solve(lp, options)
        calls += 1
        if (calls < 3) return result
        const Columns = Object.fromEntries(
          Object.entries(result.Columns).map(([name, column]) => [name, { ...column, Primal: 0 }]),
        )
        return { Status: 'Time limit reached', ObjectiveValue: Infinity, Columns, Rows: [] }
      },
    }
    const input = makeInput({ teachers: 4, nannies: 3, groups: 2 })
    expect(validateRoster(input, solve(input, empty, TEST_META))).toEqual([])
  })

  it('fails loudly when the first stage finds nothing', () => {
    const broken: LpSolver = {
      solve: () => ({ Status: 'Time limit reached', ObjectiveValue: 0, Columns: {}, Rows: [] }),
    }
    expect(() =>
      solve(makeInput({ teachers: 2, nannies: 2, groups: 1 }), broken, TEST_META),
    ).toThrow(SolveError)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/core/solve.test.ts`

Expected: FAIL in the two timeout tests — `SolveError: Solver stage "totalGap" ended with status "Time limit reached"`. The other three tests pass already.

- [ ] **Step 3: Add the budget and the fallback**

In `src/core/solve.ts`, add below the line `export const HIGHS_OPTIONS = { random_seed: 0, mip_rel_gap: 0, output_flag: false } as const`:

```ts
/** Seconds per stage. A stage that runs out keeps the best roster found so far. */
export const STAGE_TIME_LIMIT = 4
```

In `src/core/solve.ts`, replace everything from the line `const result = highs.solve(lp, HIGHS_OPTIONS)` through the line `bounds.push({ terms: objective.terms, op: '<=', rhs })` with:

```ts
    const result = highs.solve(lp, { ...HIGHS_OPTIONS, time_limit: STAGE_TIME_LIMIT })
    if (result.Status === 'Optimal') {
      columns = result.Columns
      const optimum = result.ObjectiveValue
      const rhs = INTEGRAL_STAGES.has(stage) ? Math.round(optimum) : optimum + TOLERANCE
      bounds.push({ terms: objective.terms, op: '<=', rhs })
      continue
    }
    // Out of time: every rule is a constraint, so the best roster found so far is valid.
    if (result.Status === 'Time limit reached') {
      if (hasSolution(result)) columns = result.Columns
      if (columns) break
    }
    throw new SolveError(stage, result.Status)
```

In `src/core/solve.ts`, add above the line `function decode(input: SolveInput, model: RosterModel, columns: Columns, meta: RosterMeta): Roster {`:

```ts
/** Stopped before finding any roster, HiGHS reports an infinite objective yet fills every column. */
function hasSolution(result: { ObjectiveValue: number; Columns: Columns }): boolean {
  return Number.isFinite(result.ObjectiveValue) && Object.keys(result.Columns).length > 0
}
```

- [ ] **Step 4: Run the whole suite**

Run: `npm test && npm run typecheck`

Expected: PASS (68 tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/solve.ts tests/core/solve.test.ts
git commit -m "feat(core): budget each solver stage and keep the best roster on timeout"
```

---

### Task 10: Hungarian dates and names

**Files:**
- Create: `src/i18n/hu.ts`
- Test: `tests/i18n/hu.test.ts`

Every Hungarian string lives in this one file (spec §8). Day names come in three forms, because the warnings (Phase 1) need them: *szerda* (the name), *szerdán* (on Wednesday), *szerdától* (from Wednesday). The legend states the shift times once, as spec §8.4 asks.

- [ ] **Step 1: Write the failing test**

`tests/i18n/hu.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  dayHeader,
  dayName,
  formatDate,
  formatPeriod,
  fromDay,
  groupName,
  onDay,
} from '../../src/i18n/hu'

describe('Hungarian dates', () => {
  it('names days in the forms the warnings need', () => {
    expect(dayName('2026-10-28')).toBe('szerda')
    expect(onDay('2026-10-28')).toBe('szerdán')
    expect(fromDay('2026-10-29')).toBe('csütörtöktől')
    expect(onDay('2026-10-26')).toBe('hétfőn')
    expect(onDay('2026-12-12')).toBe('szombaton')
  })

  it('writes headers, dates and periods', () => {
    expect(dayHeader('2026-10-28')).toBe('Szerda 10.28.')
    expect(formatDate('2026-10-05')).toBe('2026. október 5.')
    expect(formatPeriod(['2026-10-26', '2026-10-30'])).toBe('2026. október 26 – 30.')
    expect(formatPeriod(['2026-10-29', '2026-11-02'])).toBe('2026. október 29 – november 2.')
    expect(formatPeriod(['2026-12-28', '2027-01-01'])).toBe('2026. december 28. – 2027. január 1.')
    expect(formatPeriod(['2026-10-26'])).toBe('2026. október 26.')
    expect(groupName(2)).toBe('2. csoport')
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/i18n/hu.test.ts`

Expected: FAIL — `Cannot find module '../../src/i18n/hu'`.

- [ ] **Step 3: Implement**

`src/i18n/hu.ts`:

```ts
import { weekday } from '../core/calendar'
import type { Shift } from '../core/types'

/** Every Hungarian string the app shows lives in this file. */

type DayForms = { name: string; on: string; from: string }

const DAYS: DayForms[] = [
  { name: 'vasárnap', on: 'vasárnap', from: 'vasárnaptól' },
  { name: 'hétfő', on: 'hétfőn', from: 'hétfőtől' },
  { name: 'kedd', on: 'kedden', from: 'keddtől' },
  { name: 'szerda', on: 'szerdán', from: 'szerdától' },
  { name: 'csütörtök', on: 'csütörtökön', from: 'csütörtöktől' },
  { name: 'péntek', on: 'pénteken', from: 'péntektől' },
  { name: 'szombat', on: 'szombaton', from: 'szombattól' },
]

const MONTHS = [
  'január',
  'február',
  'március',
  'április',
  'május',
  'június',
  'július',
  'augusztus',
  'szeptember',
  'október',
  'november',
  'december',
]

export const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

/** 'szerda' */
export const dayName = (date: string) => DAYS[weekday(date)].name
/** 'szerdán' */
export const onDay = (date: string) => DAYS[weekday(date)].on
/** 'szerdától' */
export const fromDay = (date: string) => DAYS[weekday(date)].from

function parts(date: string): [number, number, number] {
  const [y, m, d] = date.split('-').map(Number)
  return [y, m, d]
}

/** Column header: 'Szerda 10.28.' */
export function dayHeader(date: string): string {
  const [, month, day] = date.split('-')
  return `${capitalize(dayName(date))} ${month}.${day}.`
}

/** '2026. október 26.' */
export function formatDate(date: string): string {
  const [y, m, d] = parts(date)
  return `${y}. ${MONTHS[m - 1]} ${d}.`
}

/** '2026. október 26 – 30.', '2026. október 29 – november 2.', '2026. december 28. – 2027. január 1.' */
export function formatPeriod(days: string[]): string {
  if (days.length === 0) return ''
  if (days.length === 1) return formatDate(days[0])
  const [y1, m1, d1] = parts(days[0])
  const [y2, m2, d2] = parts(days[days.length - 1])
  if (y1 !== y2) return `${formatDate(days[0])} – ${formatDate(days[days.length - 1])}`
  if (m1 !== m2) return `${y1}. ${MONTHS[m1 - 1]} ${d1} – ${MONTHS[m2 - 1]} ${d2}.`
  return `${y1}. ${MONTHS[m1 - 1]} ${d1} – ${d2}.`
}

export const groupName = (group: number) => `${group}. csoport`
export const groupShort = (group: number) => `${group}. cs.`
export const shiftShort: Record<Shift, string> = { morning: 'DE', afternoon: 'DU' }

export const HOLE = 'BETÖLTETLEN'

export const LEGEND = [
  'DE = délelőtt, DU = délután. Félkövér: nyit (6:00) vagy zár (18:00).',
  'Óvónő: DE 7:00–13:30, DU 10:30–17:00; pénteken és ledolgozós szombaton DE 7:00–13:00, DU 11:00–17:00.',
  'Dajka: DE 6:00–14:00, DU 10:00–18:00.',
]
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run tests/i18n/hu.test.ts && npm run typecheck`

Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/i18n/hu.ts tests/i18n/hu.test.ts
git commit -m "feat(i18n): add Hungarian day, date and group names"
```

---

### Task 11: The printout's tables as data

**Files:**
- Create: `src/export/views.ts`
- Test: `tests/export/views.test.ts`

Spec §8.4 describes two A4 landscape pages. Both become plain data here, so that Excel (this plan) and the print view (Phase 2) show the same thing:

1. **Group view:** one row per group, then *Csoporton kívül – óvónő* and *Csoporton kívül – dajka*, with the days as columns. Openers and closers are bold, holes print as red *BETÖLTETLEN*, and substitutions are orange.
2. **Person view:** one row per person, teachers first. Cells read like `DE · 1. cs. · nyit`, `DU · tartalék` or `távol`, filled pale yellow (morning), pale blue (afternoon) or grey (absent).

Optional properties are left out rather than set to `false`, so the objects compare cleanly.

- [ ] **Step 1: Write the failing test**

`tests/export/views.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { TEST_META, makeStaff } from '../core/fixtures'
import type { Roster } from '../../src/core/types'
import { groupView, personView } from '../../src/export/views'

const [MON, TUE, WED] = ['2026-10-26', '2026-10-27', '2026-10-28']
const staff = makeStaff(3, 2)

// Monday: 1 group with t3 as substitute; Tuesday: 2 groups, one teacher seat empty; Wednesday closed.
const roster: Roster = {
  period: { start: MON, days: [MON, TUE, WED] },
  groupsPerDay: { [MON]: 1, [TUE]: 2, [WED]: 0 },
  assignments: [
    {
      staffId: 't1',
      date: MON,
      shift: 'morning',
      seat: { kind: 'teacher', group: 1, shift: 'morning' },
    },
    {
      staffId: 't2',
      date: MON,
      shift: 'afternoon',
      seat: { kind: 'teacher', group: 1, shift: 'afternoon' },
    },
    { staffId: 't3', date: MON, shift: 'morning' },
    { staffId: 'n1', date: MON, shift: 'morning', seat: { kind: 'nanny', group: 1 }, opener: true },
    {
      staffId: 't1',
      date: TUE,
      shift: 'morning',
      seat: { kind: 'teacher', group: 1, shift: 'morning' },
    },
    {
      staffId: 't2',
      date: TUE,
      shift: 'afternoon',
      seat: { kind: 'teacher', group: 1, shift: 'afternoon' },
    },
    {
      staffId: 't3',
      date: TUE,
      shift: 'morning',
      seat: { kind: 'teacher', group: 2, shift: 'morning' },
    },
    { staffId: 'n1', date: TUE, shift: 'morning', seat: { kind: 'nanny', group: 1 }, opener: true },
    {
      staffId: 'n2',
      date: TUE,
      shift: 'afternoon',
      seat: { kind: 'nanny', group: 2 },
      closer: true,
    },
  ],
  holes: [
    { kind: 'closer', date: MON },
    { kind: 'teacherSeat', date: TUE, group: 2, shift: 'afternoon' },
  ],
  warnings: [],
  ...TEST_META,
}

describe('groupView', () => {
  const view = groupView(roster, staff, ['Pillangó, Süni'])

  it('has a row per group, then the reserve rows', () => {
    expect(view.rows.map((r) => r.label)).toEqual([
      '1. csoport – Pillangó, Süni',
      '2. csoport',
      'Csoporton kívül – óvónő',
      'Csoporton kívül – dajka',
    ])
  })

  it('lists the seats, bolds the keys and marks holes', () => {
    expect(view.rows[0].cells[0]).toEqual([
      { text: 'DE: T1' },
      { text: 'DU: T2' },
      { text: 'Dajka: N1 (DE, nyit)', bold: true },
    ])
    expect(view.rows[1].cells[1]).toEqual([
      { text: 'DE: T3' },
      { text: 'DU: BETÖLTETLEN', tone: 'hole' },
      { text: 'Dajka: N2 (DU, zár)', bold: true },
    ])
  })

  it('marks merged groups, closed days and the reserve', () => {
    expect(view.rows[1].cells[0]).toEqual([{ text: 'összevonva', tone: 'muted' }])
    expect(view.rows[0].cells[2]).toEqual([{ text: 'zárva', tone: 'muted' }])
    expect(view.rows[2].cells[0]).toEqual([{ text: 'T3 (DE)' }])
  })
})

describe('personView', () => {
  const view = personView(roster, staff, [{ staffId: 'n2', date: MON }])

  it('lists teachers, then nannies', () => {
    expect(view.rows.map((r) => r.name)).toEqual(['T1', 'T2', 'T3', 'N1', 'N2'])
  })

  it('describes each day', () => {
    expect(view.rows[2].cells[0]).toEqual({ text: 'DE · tartalék', fill: 'morning' })
    expect(view.rows[3].cells[0]).toEqual({
      text: 'DE · 1. cs. · nyit',
      fill: 'morning',
      bold: true,
    })
    expect(view.rows[4].cells[0]).toEqual({ text: 'távol', fill: 'absent' })
    expect(view.rows[4].cells[2]).toEqual({ text: 'zárva', fill: 'closed' })
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/export/views.test.ts`

Expected: FAIL — `Cannot find module '../../src/export/views'`.

- [ ] **Step 3: Implement**

`src/export/views.ts`:

```ts
import type { Absence, Assignment, Role, Roster, Staff } from '../core/types'
import { HOLE, groupName, groupShort, shiftShort } from '../i18n/hu'

/** The printout's two tables as plain data, shared by print and Excel. */

export type Tone = 'hole' | 'substitution' | 'muted'
export type Line = { text: string; bold?: boolean; tone?: Tone }
export type GroupView = { days: string[]; rows: { label: string; cells: Line[][] }[] }

export type Fill = 'morning' | 'afternoon' | 'absent' | 'closed'
export type PersonCell = { text: string; fill?: Fill; bold?: boolean; tone?: Tone }
export type PersonView = {
  days: string[]
  rows: { staffId: string; name: string; role: Role; cells: PersonCell[] }[]
}

function names(staff: Staff[]): (id: string) => string {
  const byId = new Map(staff.map((s) => [s.id, s.displayName]))
  return (id) => byId.get(id) ?? '?'
}

function key(a: Assignment): string {
  return a.opener ? ', nyit' : a.closer ? ', zár' : ''
}

/** Openers and closers print bold. */
function bold(a: Assignment): { bold?: true } {
  return a.opener || a.closer ? { bold: true } : {}
}

const byShiftThenName =
  (name: (id: string) => string) =>
  (a: Assignment, b: Assignment): number =>
    a.shift === b.shift
      ? name(a.staffId).localeCompare(name(b.staffId), 'hu')
      : a.shift === 'morning'
        ? -1
        : 1

/** Rows: each group, then the reserve teachers and nannies; columns: the days. */
export function groupView(roster: Roster, staff: Staff[], groupLabels: string[] = []): GroupView {
  const name = names(staff)
  const role = new Map(staff.map((s) => [s.id, s.role]))
  const days = roster.period.days
  const on = (date: string) => roster.assignments.filter((a) => a.date === date)
  const maxGroups = Math.max(0, ...days.map((date) => roster.groupsPerDay[date] ?? 0))
  const rows: GroupView['rows'] = []

  for (let g = 1; g <= maxGroups; g++) {
    const label = groupLabels[g - 1] ? `${groupName(g)} – ${groupLabels[g - 1]}` : groupName(g)
    const cells = days.map((date): Line[] => {
      const today = on(date)
      if (today.length === 0) return [{ text: 'zárva', tone: 'muted' }]
      if (g > roster.groupsPerDay[date]) {
        return [{ text: roster.groupsPerDay[date] > 0 ? 'összevonva' : '—', tone: 'muted' }]
      }
      const lines: Line[] = (['morning', 'afternoon'] as const).map((shift) => {
        const a = today.find(
          (x) => x.seat?.kind === 'teacher' && x.seat.group === g && x.seat.shift === shift,
        )
        return a
          ? { text: `${shiftShort[shift]}: ${name(a.staffId)}` }
          : { text: `${shiftShort[shift]}: ${HOLE}`, tone: 'hole' }
      })
      const nanny = today.find((x) => x.seat?.kind === 'nanny' && x.seat.group === g)
      if (nanny?.substitution) {
        lines.push({
          text: `Dajka: ${name(nanny.staffId)} (óvónő, ${shiftShort[nanny.shift]})`,
          tone: 'substitution',
        })
      } else if (nanny) {
        lines.push({
          text: `Dajka: ${name(nanny.staffId)} (${shiftShort[nanny.shift]}${key(nanny)})`,
          ...bold(nanny),
        })
      }
      return lines
    })
    rows.push({ label, cells })
  }

  for (const [label, wanted] of [
    ['Csoporton kívül – óvónő', 'teacher'],
    ['Csoporton kívül – dajka', 'nanny'],
  ] as const) {
    const cells = days.map((date) =>
      on(date)
        .filter((a) => !a.seat && role.get(a.staffId) === wanted)
        .sort(byShiftThenName(name))
        .map((a) => ({ text: `${name(a.staffId)} (${shiftShort[a.shift]}${key(a)})`, ...bold(a) })),
    )
    rows.push({ label, cells })
  }
  return { days, rows }
}

/** One row per person (teachers, then nannies): 'DE · 1. cs.', 'DU · tartalék', 'távol'. */
export function personView(roster: Roster, staff: Staff[], absences: Absence[]): PersonView {
  const days = roster.period.days
  const absent = new Set(absences.map((a) => `${a.staffId}|${a.date}`))
  const at = new Map(roster.assignments.map((a) => [`${a.staffId}|${a.date}`, a]))
  const openDays = new Set(roster.assignments.map((a) => a.date))
  const inRoster = new Set(roster.assignments.map((a) => a.staffId))
  const people = staff
    .filter((s) => inRoster.has(s.id) || (s.active && days.some((d) => absent.has(`${s.id}|${d}`))))
    .sort((a, b) =>
      a.role === b.role
        ? a.displayName.localeCompare(b.displayName, 'hu')
        : a.role === 'teacher'
          ? -1
          : 1,
    )

  const cellFor = (staffId: string, date: string): PersonCell => {
    const a = at.get(`${staffId}|${date}`)
    if (a) {
      const where = a.seat ? groupShort(a.seat.group) : 'tartalék'
      const extra = a.substitution
        ? ' (dajka helyett)'
        : a.opener
          ? ' · nyit'
          : a.closer
            ? ' · zár'
            : ''
      return {
        text: `${shiftShort[a.shift]} · ${where}${extra}`,
        fill: a.shift,
        ...bold(a),
        ...(a.substitution ? { tone: 'substitution' as const } : {}),
      }
    }
    if (!openDays.has(date)) return { text: 'zárva', fill: 'closed' }
    if (absent.has(`${staffId}|${date}`)) return { text: 'távol', fill: 'absent' }
    return { text: '' }
  }

  return {
    days,
    rows: people.map((s) => ({
      staffId: s.id,
      name: s.displayName,
      role: s.role,
      cells: days.map((date) => cellFor(s.id, date)),
    })),
  }
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run tests/export/views.test.ts && npm run typecheck`

Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/export/views.ts tests/export/views.test.ts
git commit -m "feat(export): describe the group and person tables as data"
```

---

### Task 12: Excel export

**Files:**
- Create: `src/export/xlsx.ts`
- Test: `tests/export/xlsx.test.ts`

The workbook has sheets *Csoportok* (the group view) and *Munkatársak* (the person view), set up for A4 landscape and fitted to the page width, with the legend under each table. ExcelJS is loaded with `await import('exceljs')`: it makes up most of the browser bundle, and only the export needs it. Spec §11.5 asks for a smoke test: the file opens and contains every display name.

- [ ] **Step 1: Write the failing test**

`tests/export/xlsx.test.ts`:

```ts
import ExcelJS from 'exceljs'
import loadHighs from 'highs'
import { describe, expect, it } from 'vitest'
import { TEST_META, makeInput } from '../core/fixtures'
import { solve } from '../../src/core/solve'
import { rosterFileName, rosterWorkbook, workbookBytes } from '../../src/export/xlsx'

const highs = await loadHighs()

function cellTexts(sheet: ExcelJS.Worksheet): string {
  const texts: string[] = []
  sheet.eachRow((row) =>
    row.eachCell((cell) => {
      const value = cell.value as { richText?: { text: string }[] } | string | null
      texts.push(
        typeof value === 'object' && value?.richText
          ? value.richText.map((r) => r.text).join('')
          : String(value ?? ''),
      )
    }),
  )
  return texts.join('\n')
}

describe('Excel export', () => {
  it('writes a file that opens and names everyone', async () => {
    const input = makeInput({ teachers: 4, nannies: 3, groups: 2, absent: { t4: ['2026-10-26'] } })
    const roster = solve(input, highs, TEST_META)
    const bytes = await workbookBytes(await rosterWorkbook(roster, input.staff, input.absences))

    const reopened = new ExcelJS.Workbook()
    await reopened.xlsx.load(bytes.buffer as ArrayBuffer)
    expect(reopened.worksheets.map((s) => s.name)).toEqual(['Csoportok', 'Munkatársak'])
    const text = reopened.worksheets.map(cellTexts).join('\n')
    for (const person of input.staff) expect(text).toContain(person.displayName)
    expect(rosterFileName(roster)).toBe('beosztas-2026-10-26.xlsx')
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/export/xlsx.test.ts`

Expected: FAIL — `Cannot find module '../../src/export/xlsx'`.

- [ ] **Step 3: Implement**

`src/export/xlsx.ts`:

```ts
import type { CellRichTextValue, Font, Workbook, Worksheet } from 'exceljs'
import type { Absence, Roster, Staff } from '../core/types'
import { LEGEND, dayHeader, formatPeriod } from '../i18n/hu'
import { groupView, personView, type Line, type Tone } from './views'

export type XlsxExtras = { groupLabels?: string[]; footnotes?: string[] }

const FILLS = { morning: 'FFFFF6D5', afternoon: 'FFDCEBFA', absent: 'FFE3E3E3', closed: 'FFF2F2F2' }
const COLORS: Record<Tone, string> = {
  hole: 'FFC00000',
  substitution: 'FFD46A00',
  muted: 'FF808080',
}

export function rosterFileName(roster: Roster): string {
  return `beosztas-${roster.period.start}.xlsx`
}

/** The group view and the person view, printable on A4 landscape, editable in Excel. */
export async function rosterWorkbook(
  roster: Roster,
  staff: Staff[],
  absences: Absence[],
  extras: XlsxExtras = {},
): Promise<Workbook> {
  // Loaded on demand: ExcelJS is most of the bundle and only needed here.
  const { default: ExcelJS } = await import('exceljs')
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Óvodai beosztás'
  addGroupSheet(workbook, roster, staff, extras)
  addPersonSheet(workbook, roster, staff, absences)
  return workbook
}

export async function workbookBytes(workbook: Workbook): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(await workbook.xlsx.writeBuffer())
}

function landscape(workbook: Workbook, name: string): Worksheet {
  return workbook.addWorksheet(name, {
    pageSetup: {
      paperSize: 9,
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
    },
  })
}

function font(line: { bold?: boolean; tone?: Tone }): Partial<Font> {
  return {
    ...(line.bold ? { bold: true } : {}),
    ...(line.tone ? { color: { argb: COLORS[line.tone] } } : {}),
  }
}

function richText(lines: Line[]): CellRichTextValue | string {
  if (lines.length === 0) return ''
  return {
    richText: lines.map((line, i) => ({ text: (i > 0 ? '\n' : '') + line.text, font: font(line) })),
  }
}

function addFooter(sheet: Worksheet, footnotes: string[] = []): void {
  sheet.addRow([])
  for (const note of footnotes) sheet.addRow([note])
  for (const line of LEGEND) sheet.addRow([line]).font = { size: 9 }
}

function addGroupSheet(
  workbook: Workbook,
  roster: Roster,
  staff: Staff[],
  extras: XlsxExtras,
): void {
  const view = groupView(roster, staff, extras.groupLabels)
  const sheet = landscape(workbook, 'Csoportok')
  sheet.columns = [{ width: 28 }, ...view.days.map(() => ({ width: 30 }))]
  sheet.addRow([`Beosztás — ${formatPeriod(view.days)}`]).font = { bold: true, size: 14 }
  sheet.addRow(['', ...view.days.map(dayHeader)]).font = { bold: true }
  for (const row of view.rows) {
    const excelRow = sheet.addRow([row.label, ...row.cells.map(richText)])
    excelRow.alignment = { vertical: 'top', wrapText: true }
    excelRow.getCell(1).font = { bold: true }
    excelRow.height = 16 * Math.max(1, ...row.cells.map((cell) => cell.length))
  }
  addFooter(sheet, extras.footnotes)
}

function addPersonSheet(
  workbook: Workbook,
  roster: Roster,
  staff: Staff[],
  absences: Absence[],
): void {
  const view = personView(roster, staff, absences)
  const sheet = landscape(workbook, 'Munkatársak')
  sheet.columns = [{ width: 24 }, ...view.days.map(() => ({ width: 24 }))]
  sheet.addRow([`Beosztás munkatársanként — ${formatPeriod(view.days)}`]).font = {
    bold: true,
    size: 14,
  }
  sheet.addRow(['', ...view.days.map(dayHeader)]).font = { bold: true }
  for (const row of view.rows) {
    const excelRow = sheet.addRow([row.name, ...row.cells.map((cell) => cell.text)])
    row.cells.forEach((cell, i) => {
      const target = excelRow.getCell(i + 2)
      if (cell.fill) {
        target.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FILLS[cell.fill] } }
      }
      target.font = font(cell)
    })
  }
  addFooter(sheet)
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run tests/export/xlsx.test.ts && npm run typecheck`

Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add src/export/xlsx.ts tests/export/xlsx.test.ts
git commit -m "feat(export): write the roster as an A4 landscape Excel workbook"
```

---

### Task 13: The transcribed-week format

**Files:**
- Create: `scripts/slice-input.ts`, `scripts/slice-example.json`
- Test: `tests/scripts/slice-input.test.ts`

The slice reads a week transcribed from her sheet. Names stand in for ids, because this file is typed by hand. Per spec §12, "absent" means on the staff list but missing that day. The committed example uses invented people only (spec §14).

- [ ] **Step 1: Write the failing test**

`tests/scripts/slice-input.test.ts`:

```ts
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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/scripts/slice-input.test.ts`

Expected: FAIL — `Cannot find module '../../scripts/slice-input'`.

- [ ] **Step 3: Implement the format and the example**

`scripts/slice-input.ts`:

```ts
import type { DayPlan, SolveInput, Staff } from '../src/core/types'

/** The hand-transcribed week: names as on her sheet, absences by name. */
export type SliceFile = {
  groups: number
  days: string[]
  overrides?: Record<string, number>
  staff: { name: string; role: 'teacher' | 'nanny' }[]
  absent?: Record<string, string[]>
}

export function sliceInput(file: SliceFile): SolveInput {
  const names = file.staff.map((s) => s.name)
  const duplicate = names.find((name, i) => names.indexOf(name) !== i)
  if (duplicate) throw new Error(`Duplicate name: ${duplicate}`)
  const staff: Staff[] = file.staff.map((s, i) => ({
    id: `s${i + 1}`,
    fullName: s.name,
    displayName: s.name,
    role: s.role,
    active: true,
  }))
  const idOf = new Map(staff.map((s) => [s.fullName, s.id]))
  const days = [...new Set(file.days)].sort()
  const absences = Object.entries(file.absent ?? {}).flatMap(([name, dates]) => {
    const staffId = idOf.get(name)
    if (!staffId) throw new Error(`Unknown name in "absent": ${name}`)
    return dates.map((date) => {
      if (!days.includes(date)) throw new Error(`${name}: ${date} is not one of the days`)
      return { staffId, date }
    })
  })
  const dayPlans: DayPlan[] = days.map((date) => {
    const override = file.overrides?.[date]
    return override === undefined
      ? { date, requestedGroups: file.groups }
      : { date, requestedGroups: file.groups, override }
  })
  return { staff, absences, period: { start: days[0], days }, dayPlans }
}
```

`scripts/slice-example.json`: three groups, 8 teachers and 5 nannies, with a few absences.

```json
{
  "groups": 3,
  "days": ["2026-08-24", "2026-08-25", "2026-08-26", "2026-08-27", "2026-08-28"],
  "staff": [
    { "name": "Anna", "role": "teacher" },
    { "name": "Bea", "role": "teacher" },
    { "name": "Cili", "role": "teacher" },
    { "name": "Dalma", "role": "teacher" },
    { "name": "Emese", "role": "teacher" },
    { "name": "Flóra", "role": "teacher" },
    { "name": "Gréta", "role": "teacher" },
    { "name": "Hanna", "role": "teacher" },
    { "name": "Kati", "role": "nanny" },
    { "name": "Laura", "role": "nanny" },
    { "name": "Melinda", "role": "nanny" },
    { "name": "Nóra", "role": "nanny" },
    { "name": "Olga", "role": "nanny" }
  ],
  "absent": {
    "Anna": ["2026-08-24", "2026-08-25", "2026-08-26", "2026-08-27", "2026-08-28"],
    "Cili": ["2026-08-27", "2026-08-28"],
    "Gréta": ["2026-08-26"],
    "Laura": ["2026-08-24", "2026-08-25"],
    "Olga": ["2026-08-28"]
  }
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run tests/scripts/slice-input.test.ts && npm run typecheck`

Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/slice-input.ts tests/scripts/slice-input.test.ts scripts/slice-example.json
git commit -m "feat(slice): read a hand-transcribed week"
```

---

### Task 14: The slice runner

**Files:**
- Create: `scripts/slice.ts`

`npm run slice [-- path]` solves the week, re-checks it with `validateRoster` (and exits 1 on any violation), and writes the Excel next to the input: `data/beosztas-2026-08-24.xlsx` for her week. It then prints a per-person table and the counts of holes, substitutions, switches and turnarounds, which makes the fairness visible at a glance.

- [ ] **Step 1: Implement**

`scripts/slice.ts`:

```ts
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import loadHighs from 'highs'
import { groupSwitches, turnarounds } from '../src/core/metrics'
import { solve } from '../src/core/solve'
import { validateRoster } from '../src/core/validate'
import { rosterFileName, rosterWorkbook, workbookBytes } from '../src/export/xlsx'
import { sliceInput, type SliceFile } from './slice-input'

// npm run slice [-- path/to/week.json]   (default: data/aug24.json)
const path = process.argv[2] ?? 'data/aug24.json'
const input = sliceInput(JSON.parse(await readFile(path, 'utf8')) as SliceFile)
const highs = await loadHighs()

const started = performance.now()
const roster = solve(input, highs, { solvedAt: new Date().toISOString(), appVersion: 'slice' })
const seconds = ((performance.now() - started) / 1000).toFixed(1)

const violations = validateRoster(input, roster)
if (violations.length > 0) {
  console.error('Strict-rule violations — this is a model bug:', violations)
  process.exit(1)
}

const out = join(dirname(path), rosterFileName(roster))
await writeFile(out, await workbookBytes(await rosterWorkbook(roster, input.staff, input.absences)))

console.log(`Solved in ${seconds} s → ${out}`)
console.table(
  input.staff.map((s) => {
    const mine = roster.assignments.filter((a) => a.staffId === s.id)
    return {
      name: s.displayName,
      role: s.role,
      morning: mine.filter((a) => a.shift === 'morning').length,
      afternoon: mine.filter((a) => a.shift === 'afternoon').length,
      reserve: mine.filter((a) => !a.seat).length,
      opens: mine.filter((a) => a.opener).length,
      closes: mine.filter((a) => a.closer).length,
    }
  }),
)
console.log(
  [
    `holes: ${roster.holes.length}`,
    `substitutions: ${roster.assignments.filter((a) => a.substitution).length}`,
    `group switches: ${groupSwitches(input, roster).length}`,
    `turnarounds: ${turnarounds(input, roster).length}`,
  ].join(' · '),
)
```

- [ ] **Step 2: Run it on the example**

Run: `npm run slice -- scripts/slice-example.json`

Expected: `Solved in … s → scripts/beosztas-2026-08-24.xlsx` within a few seconds (Windows prints the path with a backslash). Then a table of 13 people, and `holes: 0 · substitutions: 0 · group switches: 0 · turnarounds: 2`. The `.xlsx` is gitignored.

- [ ] **Step 3: Look at the file**

Open `scripts/beosztas-2026-08-24.xlsx` in Excel or LibreOffice. Check for two sheets, the week as the title, and one row per group plus the two *Csoporton kívül* rows. Openers and closers should be bold, and the person view coloured. File → Print preview should show each sheet on one landscape page.

- [ ] **Step 4: Run everything and commit**

Run: `npm test && npm run typecheck && npm run format:check`

Expected: PASS (79 tests), and `All matched files use Prettier code style!`.

```bash
git add scripts/slice.ts
git commit -m "feat(slice): add npm run slice to solve a week into Excel"
```

---

### Task 15: Her week (manual, local only)

**Files:**
- Create: `data/aug24.json` (gitignored — never commit it)

This task needs her Aug 24–28 sheet, so a person does it; an agent should stop here and hand over.

- [ ] **Step 1: Transcribe the week**

Create `data/`, copy `scripts/slice-example.json` to `data/aug24.json`, and replace the people with hers. Use the names exactly as on her sheet, with `role` set to `"teacher"` or `"nanny"`. Anyone on the staff list who is missing on a day goes under `"absent"` for that date. Set `"groups"` to the number of groups she ran that week. If she ran fewer groups on one day, add `"overrides": { "2026-08-26": 2 }`.

- [ ] **Step 2: Solve it**

Run: `npm run slice`

Expected: `data/beosztas-2026-08-24.xlsx`, `holes: 0` if her week was fully staffed, and no violations. If there are holes on a day she actually ran fully, check that day's absences in the JSON first.

- [ ] **Step 3: Print it**

Print both sheets on A4 landscape for the review.

---

### Task 16: Gate — her review

- [ ] **Step 1: Before she reads it, say what differs by design** (spec §12):
  - there is no *ügyelet*;
  - there is no 8–16 reserve nanny, because every nanny works 6:00–14:00 or 10:00–18:00;
  - nobody opens and closes on the same day (6:00–18:00 is more than one shift);
  - nobody opens, or closes, on every day of the week.
- [ ] **Step 2: Let her judge the printout.** Note every remark as she says it. Is it fair? Would she post it? Is anything missing on the wall sheet?
- [ ] **Step 3: Decide.** If she approves, continue with `2026-09-27-phase-1-core.md`. If she doesn't, sort her remarks into (a) bugs against the spec, which you fix now, and (b) new wishes, which go into the v2 list in spec §13 rather than into the model (the scope is frozen). Then re-run the slice and show her again.
