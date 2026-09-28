# v2-F — Sick-call recalculation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In a week in progress, a sick call (or any re-solve) keeps the days already over exactly as planned and changes as few people as possible from today on, then lists whom to phone.

**Architecture:** An `Anchor` (the saved roster, a `from` date and a mode) travels with a solve. `recalcInput` rebuilds the past days' input from the anchor. `anchorModel` pins those days in the MILP and, in 'minimal' mode, adds three stability stages ahead of fairness. `makeRoster` and the worker take the optional anchor. The roster screen asks "only the needed changes / everything from today" once a week has started, offers **Beteg lett…** next to a picked name, and shows the changed people in the undo bar.

**Tech Stack:** TypeScript, React 19, highs 1.15.3, vitest 5 with jsdom.

---

## Before you start

- Design: `docs/specs/2026-09-28-sick-call-design.md` (read it first). Spec: `docs/spec.md` §6.2 (strict rules), §6.5 (staged solve), §8.3 (Beosztás).
- Conventions as in the v1 and v2 plans:
  - Git Bash; tests first, in `tests/` mirroring `src/`.
  - One commit per task on a branch `v2-f-sick-call`.
  - `npx prettier --write` on the touched files before each commit.
  - Changes land on `main` through a PR, and CI deploys from a green `main`.
- **Words used here.**
  - **Anchor:** the roster being kept.
  - **`from`:** the first working day of the week that is today or later.
  - **Kept days** (or past days): the days before `from`.
  - **Minimal:** the fewest-changes mode.
  - **Full:** re-plan everything from `from`, past days still kept.
- Run a single test file with `npx vitest run tests/core/recalc.test.ts`.

## File structure

```text
src/core/types.ts              Anchor
src/core/recalc.ts             NEW  recalcInput, anchorModel, scheduleChanges
src/core/model.ts              keep* stages and variables; RosterModel.seats
src/core/solve.ts              solve(…, anchor?)
src/core/pipeline.ts           makeRoster(…, anchor?)
src/worker/protocol.ts         SolveRequest.anchor
src/worker/solver.worker.ts    passes the anchor on
src/worker/client.ts           solveInWorker(…, anchor?); watchdog 180 s
src/i18n/hu.ts                 shortDate, ui.recalc
src/state/sickCall.ts          NEW  workingDaysBetween, sickCall
src/state/undo.ts              UndoEntry.details
src/ui/changeLines.ts          NEW  the undo bar's "who changed" lines
src/ui/UndoBar.tsx             renders details
src/ui/WarningsPanel.tsx       fixFrom: no fixes for days already over
src/ui/RosterScreen.tsx        started-week choice, minimal quick fixes, Beteg lett…
src/app/app.css                .recalc-choice, .undo-details
tests/core/recalc.test.ts      NEW
tests/worker/client.test.ts    anchor passed on
tests/i18n/recalcText.test.ts  NEW
tests/state/sickCall.test.ts   NEW
tests/ui/changeLines.test.ts   NEW
tests/ui/UndoBar.test.tsx      NEW
tests/ui/RosterScreen.test.tsx week-in-progress and sick-call scenarios
docs/spec.md                   §6.5, §8.3, §13
```

---

### Task 1: The anchor and the input of a recalculation

**Files:**
- Modify: `src/core/types.ts` (after `SolveInput`)
- Create: `src/core/recalc.ts`
- Test: `tests/core/recalc.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/core/recalc.test.ts`:

```ts
import loadHighs from 'highs'
import { describe, expect, it } from 'vitest'
import { TEST_META, makeInput } from './fixtures'
import { recalcInput } from '../../src/core/recalc'
import { solve } from '../../src/core/solve'
import type { Anchor, Roster } from '../../src/core/types'

const highs = await loadHighs()
const MON = '2026-10-26'
const TUE = '2026-10-27'
const WED = '2026-10-28'

// A three-day week, T4 on leave on Monday, solved once: the roster a recalculation keeps.
const week = makeInput({
  teachers: 4,
  nannies: 3,
  groups: 2,
  days: [MON, TUE, WED],
  absent: { t4: [MON] },
})
const planned = solve(week, highs, TEST_META)
const keeping = (from: string, roster: Roster = planned): Anchor => ({
  roster,
  from,
  mode: 'minimal',
})

describe('recalcInput', () => {
  it('changes nothing while no day is over', () => {
    expect(recalcInput(week, keeping(MON))).toEqual(week)
  })

  it('reads who worked a past day from the roster, not from absences typed since', () => {
    const typed = {
      ...week,
      absences: [
        ...week.absences,
        { staffId: 'n1', date: MON, kind: 'sick' as const },
        { staffId: 'n1', date: WED, kind: 'sick' as const },
      ],
    }
    const derived = recalcInput(typed, keeping(TUE))!
    expect(derived.absences.filter((a) => a.date === MON)).toEqual([
      { staffId: 't4', date: MON, kind: 'leave' },
    ])
    expect(derived.absences.filter((a) => a.date !== MON)).toEqual([
      { staffId: 'n1', date: WED, kind: 'sick' },
    ])
  })

  it("keeps a past day's group count even if its plan changed since", () => {
    const fewer = {
      ...week,
      dayPlans: week.dayPlans.map((p) => (p.date === MON ? { ...p, override: 1 } : p)),
    }
    const derived = recalcInput(fewer, keeping(TUE))!
    expect(derived.dayPlans[0]).toEqual({ date: MON, requestedGroups: 2, override: 2 })
    expect(derived.dayPlans.slice(1)).toEqual(fewer.dayPlans.slice(1))
  })

  it('keeps a past day closed when nobody worked it', () => {
    const closed = makeInput({
      teachers: 4,
      nannies: 3,
      groups: 2,
      days: [MON, TUE, WED],
      overrides: { [MON]: 0 },
    })
    const reopened = makeInput({ teachers: 4, nannies: 3, groups: 2, days: [MON, TUE, WED] })
    const derived = recalcInput(reopened, keeping(TUE, solve(closed, highs, TEST_META)))!
    expect(derived.dayPlans[0]).toEqual({ date: MON, requestedGroups: 2, override: 0 })
  })

  it('gives up on another period, or on a past day worked by someone no longer active', () => {
    const shorter = {
      ...week,
      period: { start: MON, days: [MON, TUE] },
      dayPlans: week.dayPlans.slice(0, 2),
    }
    expect(recalcInput(shorter, keeping(TUE))).toBeUndefined()
    const gone = {
      ...week,
      staff: week.staff.map((s) => (s.id === 'n1' ? { ...s, active: false } : s)),
    }
    expect(recalcInput(gone, keeping(TUE))).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/core/recalc.test.ts`
Expected: FAIL — `Failed to resolve import "../../src/core/recalc"`.

- [ ] **Step 3: Add the type and `recalcInput`**

In `src/core/types.ts`, after the `SolveInput` type:

```ts
/**
 * Re-plan a week in progress from `from` on (the sick-call recalculation, v2): days before it stay
 * as `roster` has them. 'minimal' changes as few people as it can; 'full' re-plans the rest freely.
 */
export type Anchor = { roster: Roster; from: string; mode: 'minimal' | 'full' }
```

Create `src/core/recalc.ts`:

```ts
import { dayCapacities } from './capacity'
import type { Absence, Anchor, DayPlan, SolveInput } from './types'

/**
 * The input a recalculation solves. Days before `anchor.from` are history: who worked them, and
 * in how many groups, is read from the anchor roster rather than from today's absences, so an
 * absence typed in afterwards can neither break nor rewrite a past day. Undefined when the anchor
 * cannot be kept: another period, or a past day worked by someone no longer active.
 */
export function recalcInput(input: SolveInput, anchor: Anchor): SolveInput | undefined {
  const { roster, from } = anchor
  if (roster.period.days.join() !== input.period.days.join()) return undefined
  const kept = new Set(input.period.days.filter((date) => date < from))
  const active = new Set(input.staff.filter((s) => s.active).map((s) => s.id))
  const worked = new Set<string>()
  const workedOn = new Set<string>()
  for (const a of roster.assignments) {
    if (!kept.has(a.date)) continue
    if (!active.has(a.staffId)) return undefined
    worked.add(`${a.staffId}|${a.date}`)
    workedOn.add(a.date)
  }

  const kindOf = new Map(input.absences.map((a) => [`${a.staffId}|${a.date}`, a.kind]))
  const absences: Absence[] = [
    ...input.absences.filter((a) => !kept.has(a.date)),
    ...[...kept].flatMap((date) =>
      [...active]
        .filter((staffId) => !worked.has(`${staffId}|${date}`))
        .map((staffId) => ({
          staffId,
          date,
          kind: kindOf.get(`${staffId}|${date}`) ?? ('other' as const),
        })),
    ),
  ]
  const derived = { ...input, absences }
  const groups = new Map(dayCapacities(derived).map((c) => [c.date, c.groups]))
  const dayPlans: DayPlan[] = input.dayPlans.map((plan) => {
    if (!kept.has(plan.date)) return plan
    // Nobody worked it: it was closed (or had nobody), and stays so.
    if (!workedOn.has(plan.date)) return { ...plan, override: 0 }
    const had = roster.groupsPerDay[plan.date]
    return groups.get(plan.date) === had ? plan : { ...plan, override: had }
  })
  return { ...derived, dayPlans }
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run tests/core/recalc.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Typecheck and commit**

```bash
git checkout -b v2-f-sick-call
npm run typecheck
npx prettier --write src/core/types.ts src/core/recalc.ts tests/core/recalc.test.ts
git add src/core/types.ts src/core/recalc.ts tests/core/recalc.test.ts
git commit -m "feat(recalc): anchor type and the input of a recalculation"
```

---

### Task 2: Pin the past, and change as few people as possible

**Files:**
- Modify: `src/core/model.ts` (`STAGES`, `INTEGRAL_STAGES`, `v`, `RosterModel`, `buildModel`'s return)
- Modify: `src/core/recalc.ts` (add `anchorModel`)
- Modify: `src/core/solve.ts` (`solve`)
- Modify: `src/worker/client.ts` (`SOLVE_TIMEOUT_MS`): the watchdog test in `tests/worker/client.test.ts` requires it to outlast every stage, and there are now 10.
- Test: `tests/core/recalc.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `tests/core/recalc.test.ts`. First extend the imports at the top of the file:

```ts
import { TEST_META, makeInput, randomInput } from './fixtures'
import { anchorModel, recalcInput } from '../../src/core/recalc'
import { buildModel, v } from '../../src/core/model'
import { solve } from '../../src/core/solve'
import { validateRoster } from '../../src/core/validate'
import type { Anchor, Assignment, Roster, Shift } from '../../src/core/types'
```

(These replace the Task 1 import lines for `fixtures`, `recalc` and `types`, and add the others.)

Then append:

```ts
// One day, one group: the wall as it was planned before anyone called in sick.
const day = (staffId: string, shift: Shift, rest: Partial<Assignment> = {}): Assignment => ({
  staffId,
  date: WED,
  shift,
  ...rest,
})
const oneDay = (assignments: Assignment[]): Roster => ({
  period: { start: WED, days: [WED] },
  groupsPerDay: { [WED]: 1 },
  assignments,
  holes: [],
  warnings: [],
  ...TEST_META,
})
const wall = oneDay([
  day('t1', 'morning', { seat: { kind: 'teacher', group: 1, shift: 'morning' } }),
  day('t2', 'afternoon', { seat: { kind: 'teacher', group: 1, shift: 'afternoon' } }),
  day('t3', 'afternoon'),
  day('n1', 'morning', { seat: { kind: 'nanny', group: 1 }, opener: true }),
  day('n2', 'afternoon', { closer: true }),
  day('n3', 'morning'),
])
const of = (r: Roster, id: string) => r.assignments.find((a) => a.staffId === id)
const on = (r: Roster, date: string) =>
  r.assignments
    .filter((a) => a.date === date)
    .sort((a, b) => a.staffId.localeCompare(b.staffId))

/** Solves the one-day week again with `sick` away, keeping `roster`. */
function recalcWed(roster: Roster, sick: string[]) {
  const input = makeInput({
    teachers: 3,
    nannies: 3,
    groups: 1,
    days: [WED],
    absent: Object.fromEntries(sick.map((id) => [id, [WED]])),
  })
  const anchor: Anchor = { roster, from: WED, mode: 'minimal' }
  const derived = recalcInput(input, anchor)!
  const result = solve(derived, highs, TEST_META, anchor)
  expect(validateRoster(derived, result)).toEqual([])
  return result
}

describe('anchored solve', () => {
  it('lets a reserve on the same shift take the seat, and moves nobody else', () => {
    const r = recalcWed(wall, ['t2'])
    expect(of(r, 't3')).toEqual(
      day('t3', 'afternoon', { seat: { kind: 'teacher', group: 1, shift: 'afternoon' } }),
    )
    for (const id of ['t1', 'n1', 'n2', 'n3']) expect(of(r, id)).toEqual(of(wall, id))
  })

  it('gives the seat and the key to the nanny already on that shift', () => {
    const r = recalcWed(wall, ['n1'])
    expect(of(r, 'n3')).toEqual(day('n3', 'morning', { seat: { kind: 'nanny', group: 1 }, opener: true }))
    for (const id of ['t1', 't2', 't3', 'n2']) expect(of(r, id)).toEqual(of(wall, id))
  })

  it("changes one person's hours when it must, and keeps the closer", () => {
    const late = oneDay(wall.assignments.map((a) => (a.staffId === 'n3' ? day('n3', 'afternoon') : a)))
    const r = recalcWed(late, ['n1'])
    expect(of(r, 'n3')).toEqual(day('n3', 'morning', { seat: { kind: 'nanny', group: 1 }, opener: true }))
    expect(of(r, 'n2')).toEqual(of(late, 'n2'))
  })

  it('keeps every day before `from` exactly as planned, in both modes', () => {
    // N1 falls ill from Tuesday; her Monday absence is typed in too, after the fact.
    const sick = {
      ...week,
      absences: [
        ...week.absences,
        ...[MON, TUE, WED].map((date) => ({ staffId: 'n1', date, kind: 'sick' as const })),
      ],
    }
    for (const mode of ['minimal', 'full'] as const) {
      const anchor: Anchor = { roster: planned, from: TUE, mode }
      const derived = recalcInput(sick, anchor)!
      const r = solve(derived, highs, TEST_META, anchor)
      expect(validateRoster(derived, r)).toEqual([])
      expect(on(r, MON)).toEqual(on(planned, MON))
      expect(r.assignments.some((a) => a.staffId === 'n1' && a.date >= TUE)).toBe(false)
    }
  })

  it("weighs an earlier day's change of hours above a later one's", () => {
    const anchor: Anchor = { roster: planned, from: MON, mode: 'minimal' }
    const model = buildModel(recalcInput(week, anchor)!)
    anchorModel(model, anchor)
    const terms = model.objectives.keepHours.terms
    expect(terms.get(v.keptHours(0, 0))).toBe(3) // t1 on Monday
    expect(terms.get(v.keptHours(0, 2))).toBe(1) // t1 on Wednesday
  })

  it('adds no stability stage in full mode', () => {
    const anchor: Anchor = { roster: planned, from: TUE, mode: 'full' }
    const model = buildModel(recalcInput(week, anchor)!)
    anchorModel(model, anchor)
    expect(model.objectives.keepPeople.isEmpty()).toBe(true)
    expect(model.objectives.keepDuties.isEmpty()).toBe(true)
  })

  it.each([1, 2, 3, 4, 5, 6, 7, 8])(
    'seed %i: a random sick call keeps the past and every strict rule',
    (seed) => {
      const input = randomInput(seed)
      const days = input.period.days
      if (days.length < 2) return
      const before = solve(input, highs, TEST_META)
      const from = days[1]
      const victim = before.assignments.find((a) => a.date === from)
      if (!victim) return
      const sick = {
        ...input,
        absences: [
          ...input.absences.filter((a) => a.staffId !== victim.staffId || a.date < from),
          ...days
            .filter((date) => date >= from)
            .map((date) => ({ staffId: victim.staffId, date, kind: 'sick' as const })),
        ],
      }
      for (const mode of ['minimal', 'full'] as const) {
        const anchor: Anchor = { roster: before, from, mode }
        const derived = recalcInput(sick, anchor)!
        const r = solve(derived, highs, TEST_META, anchor)
        expect(validateRoster(derived, r)).toEqual([])
        expect(on(r, days[0])).toEqual(on(before, days[0]))
      }
    },
    120_000,
  )
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/core/recalc.test.ts`
Expected: FAIL — `anchorModel` is not exported, `v.keptHours` is not a function.

- [ ] **Step 3: Model hooks in `src/core/model.ts`**

Replace the `STAGES` and `INTEGRAL_STAGES` block with:

```ts
/**
 * Solve stages in strict priority order (spec §6.5). The keep* stages only count in a
 * recalculation of a week in progress (v2-F); 'yearly' is the v2 tie-break.
 */
export const STAGES = [
  'holes',
  'substitutions',
  'keepPeople',
  'keepHours',
  'keepDuties',
  'worstGap',
  'totalGap',
  'switches',
  'turnarounds',
  'yearly',
] as const
export type Stage = (typeof STAGES)[number]

/** Stages whose objective counts binaries, so the optimum is a whole number. */
export const INTEGRAL_STAGES: ReadonlySet<Stage> = new Set([
  'holes',
  'substitutions',
  'keepPeople',
  'keepHours',
  'keepDuties',
  'switches',
  'turnarounds',
])
```

In `v`, after `turnaround`, add:

```ts
  keptPerson: (p: number) => `kp_${p}`,
  keptHours: (p: number, d: number) => `kh_${p}_${d}`,
  keptDuties: (p: number, d: number) => `kd_${p}_${d}`,
```

In `RosterModel`, after `capacities: DayCapacity[]`, add:

```ts
  /** Per day, per person: the sum of their seat variables (empty if they can have none). */
  seats: Lin[][]
```

and change `buildModel`'s last line to:

```ts
  return { milp, objectives, people, days, capacities, seats }
```

- [ ] **Step 4: `anchorModel` in `src/core/recalc.ts`**

Change the imports to:

```ts
import { dayCapacities } from './capacity'
import { Lin } from './lp'
import { v, type RosterModel } from './model'
import type { Absence, Anchor, Assignment, DayPlan, SolveInput } from './types'
```

Append:

```ts
/**
 * Ties a model to its anchor (spec §6.5). Days before `from` are fixed as the anchor has them. In
 * 'minimal' mode every later difference costs, in three stages: people whose hours change, then
 * those days (an earlier one costs more — today's phone calls are the hardest), then seat and key
 * moves at unchanged hours. Someone the anchor had off (a call-in) is placed freely.
 */
export function anchorModel(model: RosterModel, anchor: Anchor): void {
  const { milp, objectives, people, days, seats } = model
  const planned = new Map(anchor.roster.assignments.map((a) => [`${a.staffId}|${a.date}`, a]))
  const declared = new Set(milp.binaries)
  const later = days.filter((day) => day.date >= anchor.from)
  const changedPerson = new Map<number, string>()
  const isNanny = (p: number) => people[p].role === 'nanny'

  /** The variable of the anchor's seat, if this model has that seat. */
  const seatOf = (p: number, d: number, a: Assignment): string | undefined => {
    if (!a.seat) return undefined
    const name =
      a.seat.kind === 'teacher'
        ? v.teacherSeat(p, d, a.seat.group, a.seat.shift)
        : a.substitution
          ? v.substitution(p, d, a.seat.group)
          : v.nannySeat(p, d, a.seat.group)
    return declared.has(name) ? name : undefined
  }
  /** 1 when the binary `name` is not `want`, else 0. */
  const differs = (name: string, want: boolean) =>
    want ? Lin.constant(1).add(name, -1) : new Lin().add(name)

  for (const day of days) {
    const d = day.index
    for (const p of day.present) {
      const a = planned.get(`${people[p].id}|${day.date}`)
      if (day.date < anchor.from) {
        // recalcInput made the present exactly the anchor's people, so each has a day to keep.
        if (!a) throw new Error(`Nothing to keep for ${people[p].id} on ${day.date}`)
        milp.constrain(new Lin().add(v.shift(p, d, a.shift)), '=', 1)
        const seat = seatOf(p, d, a)
        if (a.seat && !seat) throw new Error(`No such seat for ${people[p].id} on ${day.date}`)
        if (seat) milp.constrain(new Lin().add(seat), '=', 1)
        else if (!seats[d][p].isEmpty()) milp.constrain(new Lin().plus(seats[d][p]), '=', 0)
        if (isNanny(p)) {
          milp.constrain(new Lin().add(v.open(p, d)), '=', a.opener ? 1 : 0)
          milp.constrain(new Lin().add(v.close(p, d)), '=', a.closer ? 1 : 0)
        }
        continue
      }
      if (anchor.mode !== 'minimal' || !a) continue

      const hours = milp.nonNegative(v.keptHours(p, d))
      milp.constrain(new Lin().add(hours), '>=', differs(v.shift(p, d, a.shift), true))
      objectives.keepHours.add(hours, later.length - later.indexOf(day))
      let person = changedPerson.get(p)
      if (!person) {
        person = milp.nonNegative(v.keptPerson(p))
        changedPerson.set(p, person)
        objectives.keepPeople.add(person)
      }
      milp.constrain(new Lin().add(person), '>=', new Lin().add(hours))

      const duties = milp.nonNegative(v.keptDuties(p, d))
      const seat = seatOf(p, d, a)
      const moved = a.seat
        ? seat
          ? differs(seat, true)
          : Lin.constant(1) // the anchor's group is gone today
        : new Lin().plus(seats[d][p])
      milp.constrain(new Lin().add(duties), '>=', moved)
      if (isNanny(p)) {
        milp.constrain(new Lin().add(duties), '>=', differs(v.open(p, d), a.opener === true))
        milp.constrain(new Lin().add(duties), '>=', differs(v.close(p, d), a.closer === true))
      }
      objectives.keepDuties.add(duties)
    }
  }
}
```

- [ ] **Step 5: `solve` takes the anchor, in `src/core/solve.ts`**

Add the imports:

```ts
import { anchorModel } from './recalc'
```

and add `type Anchor,` to the `./types` import list. Replace the doc comment and first line of `solve`:

```ts
/**
 * Staged solve (§6.5): each stage's optimum becomes a bound for the next, so a
 * later stage only chooses among rosters tied on every earlier one. With an anchor (a week in
 * progress), `input` must come from `recalcInput`.
 */
export function solve(input: SolveInput, highs: LpSolver, meta: RosterMeta, anchor?: Anchor): Roster {
  const model = buildModel(input)
  if (anchor) anchorModel(model, anchor)
```

- [ ] **Step 6: Raise the watchdog in `src/worker/client.ts`**

```ts
/**
 * Every solver stage stops itself (STAGE_TIME_LIMIT); this outlasts all of them — ten in a
 * recalculation — and only catches a hang.
 */
export const SOLVE_TIMEOUT_MS = 180_000
```

- [ ] **Step 7: Run the tests**

Run: `npx vitest run tests/core tests/worker`
Expected: PASS. That includes `solve.test.ts`: its early-stop test still stops at `totalGap`, because empty stages are skipped without a HiGHS call. It also includes the watchdog test (180 000 > 10 × 15 000).

- [ ] **Step 8: Typecheck and commit**

```bash
npm run typecheck
npx prettier --write src/core/model.ts src/core/recalc.ts src/core/solve.ts src/worker/client.ts tests/core/recalc.test.ts
git add src/core/model.ts src/core/recalc.ts src/core/solve.ts src/worker/client.ts tests/core/recalc.test.ts
git commit -m "feat(recalc): pin the days already over; keep people, hours and duties first"
```

---

### Task 3: Through the pipeline and the worker; what changed

**Files:**
- Modify: `src/core/pipeline.ts`
- Modify: `src/core/recalc.ts` (add `scheduleChanges`)
- Modify: `src/worker/protocol.ts`, `src/worker/solver.worker.ts`, `src/worker/client.ts`
- Test: `tests/core/recalc.test.ts`, `tests/worker/client.test.ts`

- [ ] **Step 1: Write the failing tests**

In `tests/core/recalc.test.ts` extend the imports:

```ts
import { anchorModel, recalcInput, scheduleChanges } from '../../src/core/recalc'
import { makeRoster } from '../../src/core/pipeline'
import { demoState } from '../../src/demo/demoData'
import { solveInputFor } from '../../src/state/solveInput'
```

Append:

```ts
describe('makeRoster with an anchor', () => {
  it('solves from the anchor, and a hand-edited anchor keeps its mark', () => {
    const input = makeInput({ teachers: 3, nannies: 3, groups: 1, days: [WED], absent: { t2: [WED] } })
    const anchor: Anchor = { roster: { ...wall, edited: true }, from: WED, mode: 'minimal' }
    const result = makeRoster(input, highs, TEST_META, anchor)
    if (!result.ok) throw new Error('expected a roster')
    expect(result.roster.edited).toBe(true)
    expect(of(result.roster, 't3')?.seat).toEqual({ kind: 'teacher', group: 1, shift: 'afternoon' })
  })

  it('refuses an anchor from another period', () => {
    const input = makeInput({ teachers: 3, nannies: 3, groups: 1, days: [TUE] })
    expect(() => makeRoster(input, highs, TEST_META, keeping(TUE, wall))).toThrow()
  })
})

describe('scheduleChanges', () => {
  it('lists the days from `from` on that someone still works, but differently', () => {
    const after = oneDay(
      wall.assignments
        .filter((a) => a.staffId !== 't2')
        .map((a) =>
          a.staffId === 't3'
            ? day('t3', 'afternoon', { seat: { kind: 'teacher', group: 1, shift: 'afternoon' } })
            : a.staffId === 'n3'
              ? day('n3', 'afternoon')
              : a,
        ),
    )
    expect(scheduleChanges(wall, after, WED)).toEqual([
      { staffId: 't3', date: WED, before: of(wall, 't3'), after: of(after, 't3'), hours: false },
      { staffId: 'n3', date: WED, before: of(wall, 'n3'), after: of(after, 'n3'), hours: true },
    ])
    expect(scheduleChanges(wall, after, '2026-10-29')).toEqual([])
  })
})

describe('a realistic week', () => {
  it('changes one or two people for a sick nanny — far fewer than a full re-plan', () => {
    const state = demoState('2026-09-18')
    const input = solveInputFor(state, '2026-10-26')
    const before = solve(input, highs, TEST_META)
    const sick = {
      ...input,
      absences: [
        ...input.absences,
        ...[WED, '2026-10-29'].map((date) => ({ staffId: 'demo-nanny-1', date, kind: 'sick' as const })),
      ],
    }
    const changedPeople = (mode: Anchor['mode']) => {
      const anchor: Anchor = { roster: before, from: WED, mode }
      const after = solve(recalcInput(sick, anchor)!, highs, TEST_META, anchor)
      return new Set(scheduleChanges(before, after, WED).map((c) => c.staffId)).size
    }
    expect(changedPeople('minimal')).toBeLessThanOrEqual(2)
    expect(changedPeople('minimal')).toBeLessThan(changedPeople('full'))
  }, 120_000)
})
```

In `tests/worker/client.test.ts`, inside `describe('solveInWorker', …)`, add:

```ts
  it('passes a recalculation anchor on to the worker', async () => {
    let seen: SolveRequest | undefined
    FakeWorker.reply = (request) => {
      seen = request
      return solved(request)
    }
    const { solveInWorker } = await loadClient()
    const anchor = { roster, from: input.period.days[1], mode: 'minimal' as const }
    await solveInWorker(input, TEST_META, anchor)
    expect(seen?.anchor).toEqual(anchor)
  })
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/core/recalc.test.ts tests/worker/client.test.ts`
Expected: FAIL — `scheduleChanges` is not exported, and TypeScript/vitest reports `solveInWorker` getting 3 arguments where it expects 2 (`seen.anchor` undefined).

- [ ] **Step 3: `makeRoster` in `src/core/pipeline.ts`**

Replace the file with:

```ts
import { explain } from './explain'
import { balanceOf } from './fairness'
import { recalcInput } from './recalc'
import { solve, type LpSolver } from './solve'
import type { Anchor, Roster, RosterMeta, SolveInput } from './types'
import { validateRoster, type Violation } from './validate'

export type RosterResult = { ok: true; roster: Roster } | { ok: false; violations: Violation[] }

/**
 * Solve, re-check every strict rule, then explain. A roster that fails the check is never shown.
 * With an anchor (a week in progress) the days before `anchor.from` stay as planned (§6.5).
 */
export function makeRoster(
  input: SolveInput,
  highs: LpSolver,
  meta: RosterMeta,
  anchor?: Anchor,
): RosterResult {
  const solveInput = anchor ? recalcInput(input, anchor) : input
  if (!solveInput) throw new Error('The roster to keep no longer fits this week')
  const roster = solve(solveInput, highs, meta, anchor)
  const violations = validateRoster(solveInput, roster)
  if (violations.length > 0) return { ok: false, violations }
  // Hand edits on the kept days stay, so the roster stays marked.
  const edited = anchor?.roster.edited ? { edited: true as const } : {}
  return {
    ok: true,
    roster: {
      ...roster,
      ...edited,
      warnings: explain(solveInput, roster),
      balance: balanceOf(solveInput, roster),
    },
  }
}
```

- [ ] **Step 4: `scheduleChanges` in `src/core/recalc.ts`**

Change the `./types` import to include `Roster`:

```ts
import type { Absence, Anchor, Assignment, DayPlan, Roster, SolveInput } from './types'
```

Append:

```ts
export type ScheduleChange = {
  staffId: string
  date: string
  before: Assignment
  after: Assignment
  hours: boolean // the shift changed, not just the seat or the key
}

const seatKey = (a: Assignment) =>
  a.seat ? `${a.seat.kind}${a.seat.group}${a.seat.kind === 'teacher' ? a.seat.shift : ''}` : ''

const sameDay = (a: Assignment, b: Assignment) =>
  a.shift === b.shift &&
  seatKey(a) === seatKey(b) &&
  !a.opener === !b.opener &&
  !a.closer === !b.closer &&
  !a.substitution === !b.substitution

/** Days from `from` on that someone works both before and after, but differently. */
export function scheduleChanges(before: Roster, after: Roster, from: string): ScheduleChange[] {
  const was = new Map(before.assignments.map((a) => [`${a.staffId}|${a.date}`, a]))
  return after.assignments.flatMap((now) => {
    const then = was.get(`${now.staffId}|${now.date}`)
    if (now.date < from || !then || sameDay(then, now)) return []
    return [
      {
        staffId: now.staffId,
        date: now.date,
        before: then,
        after: now,
        hours: then.shift !== now.shift,
      },
    ]
  })
}
```

- [ ] **Step 5: The worker carries the anchor**

`src/worker/protocol.ts`:

```ts
import type { Anchor, Roster, RosterMeta, SolveInput } from '../core/types'

export type SolveRequest = { id: number; input: SolveInput; meta: RosterMeta; anchor?: Anchor }
```

(keep `SolveResponse` as it is).

`src/worker/solver.worker.ts`, in `onmessage`:

```ts
  const { id, input, meta, anchor } = event.data
  try {
    const result = makeRoster(input, await highs, meta, anchor)
```

`src/worker/client.ts`: import `Anchor` in the type import and change the function:

```ts
import type { Anchor, Roster, RosterMeta, SolveInput } from '../core/types'
```

```ts
/** Solves off the main thread, so the page stays responsive; a stuck worker is replaced. */
export function solveInWorker(input: SolveInput, meta: RosterMeta, anchor?: Anchor): Promise<Roster> {
```

and the last line inside the promise:

```ts
    current.postMessage({ id, input, meta, ...(anchor ? { anchor } : {}) } satisfies SolveRequest)
```

- [ ] **Step 6: Run the tests**

Run: `npx vitest run tests/core tests/worker`
Expected: PASS.

- [ ] **Step 7: Typecheck and commit**

```bash
npm run typecheck
npx prettier --write src/core/pipeline.ts src/core/recalc.ts src/worker tests/core/recalc.test.ts tests/worker/client.test.ts
git add src/core/pipeline.ts src/core/recalc.ts src/worker tests/core/recalc.test.ts tests/worker/client.test.ts
git commit -m "feat(recalc): anchored solves through the pipeline and the worker; list what changed"
```

---

### Task 4: Words, the sick-call action, and the undo bar's lines

**Files:**
- Modify: `src/i18n/hu.ts` (imports, `shortDate`, `ui.recalc`)
- Create: `src/state/sickCall.ts`, `src/ui/changeLines.ts`
- Modify: `src/state/undo.ts` (`UndoEntry.details`), `src/ui/UndoBar.tsx`, `src/app/app.css`
- Test: `tests/i18n/recalcText.test.ts`, `tests/state/sickCall.test.ts`, `tests/ui/changeLines.test.ts`, `tests/ui/UndoBar.test.tsx`

- [ ] **Step 1: Write the failing tests**

`tests/i18n/recalcText.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { ui } from '../../src/i18n/hu'

describe('recalculation texts', () => {
  it('names a sick call by its dates', () => {
    expect(ui.recalc.didSick('Kati', '2026-10-28', '2026-10-28')).toBe('Kati beteg: 10.28.')
    expect(ui.recalc.didSick('Kati', '2026-10-28', '2026-10-30')).toBe('Kati beteg: 10.28.–10.30.')
  })

  it('asks until when, from the picked day', () => {
    expect(ui.recalc.sickUntil('Kati', '2026-10-27')).toBe('Kati beteg keddtől — meddig?')
  })

  it('counts the people whose day changed', () => {
    expect(ui.recalc.changedPeople(0)).toBe('Senki más beosztása nem változott.')
    expect(ui.recalc.changedPeople(2)).toBe('2 munkatárs beosztása változott:')
  })

  it('describes a day by its hours, place and key', () => {
    const date = '2026-10-28'
    expect(
      ui.recalc.dayText('nanny', {
        staffId: 'n1',
        date,
        shift: 'morning',
        seat: { kind: 'nanny', group: 2 },
        opener: true,
      }),
    ).toBe('DE 6:00–14:00, 2. cs., nyit')
    expect(ui.recalc.dayText('teacher', { staffId: 't1', date: '2026-10-30', shift: 'afternoon' })).toBe(
      'DU 11:00–17:00, csoporton kívül',
    )
    expect(ui.recalc.change('Bea', date, true, 'DE 7:00–13:30, 1. cs.', 'DU 10:30–17:00, csoporton kívül')).toBe(
      'Bea: ma DE 7:00–13:30, 1. cs. (eddig DU 10:30–17:00, csoporton kívül)',
    )
    expect(ui.recalc.change('Bea', date, false, 'x', 'y')).toBe('Bea: szerdán x (eddig y)')
  })
})
```

`tests/state/sickCall.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { makeStaff } from '../core/fixtures'
import { emptyState, reducer } from '../../src/state/appState'
import { sickCall } from '../../src/state/sickCall'

// N1 already has a day of leave on Thursday.
const state = reducer(
  { ...emptyState(), staff: makeStaff(1, 1) },
  { type: 'setAbsent', staffId: 'n1', dates: ['2026-10-29'], absent: true, kind: 'leave' },
)

describe('sickCall', () => {
  it('marks every working day of the range sick, the weekend skipped', () => {
    const call = sickCall(state, 'n1', '2026-10-29', '2026-11-03')
    expect(call.dates).toEqual(['2026-10-29', '2026-10-30', '2026-11-02', '2026-11-03'])
    expect(call.action).toEqual({
      type: 'setAbsent',
      staffId: 'n1',
      dates: call.dates,
      absent: true,
      kind: 'sick',
    })
  })

  it('undoes to exactly what those days held before', () => {
    const call = sickCall(state, 'n1', '2026-10-28', '2026-10-30')
    const back = call.inverse.reduce(reducer, reducer(state, call.action))
    expect(back.absences).toEqual(state.absences)
  })
})
```

`tests/ui/changeLines.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { TEST_META, makeStaff } from '../core/fixtures'
import type { Assignment, Roster } from '../../src/core/types'
import { changeLines } from '../../src/ui/changeLines'

const WED = '2026-10-28'
const THU = '2026-10-29'
const staff = makeStaff(2, 1)
const roster = (assignments: Assignment[]): Roster => ({
  period: { start: WED, days: [WED, THU] },
  groupsPerDay: { [WED]: 1, [THU]: 1 },
  assignments,
  holes: [],
  warnings: [],
  ...TEST_META,
})
const before = roster([
  { staffId: 't1', date: WED, shift: 'morning', seat: { kind: 'teacher', group: 1, shift: 'morning' } },
  { staffId: 't2', date: WED, shift: 'afternoon' },
  { staffId: 't2', date: THU, shift: 'afternoon' },
  { staffId: 'n1', date: THU, shift: 'morning', opener: true },
])
// T1 is off sick; T2 covers her morning on Wednesday and comes in the morning on Thursday too.
const after = roster([
  { staffId: 't2', date: WED, shift: 'morning', seat: { kind: 'teacher', group: 1, shift: 'morning' } },
  { staffId: 't2', date: THU, shift: 'morning' },
  { staffId: 'n1', date: THU, shift: 'morning', opener: true },
])

describe('changeLines', () => {
  it("counts people, then lists each changed day, today's first", () => {
    expect(changeLines(before, after, WED, staff, WED)).toEqual([
      '1 munkatárs beosztása változott:',
      'T2: ma DE 7:00–13:30, 1. cs. (eddig DU 10:30–17:00, csoporton kívül)',
      'T2: csütörtökön DE 7:00–13:30, csoporton kívül (eddig DU 10:30–17:00, csoporton kívül)',
    ])
  })

  it('says so when nobody else changed', () => {
    expect(changeLines(before, before, WED, staff, WED)).toEqual([
      'Senki más beosztása nem változott.',
    ])
  })
})
```

`tests/ui/UndoBar.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { UndoEntry } from '../../src/state/undo'
import { UndoBar } from '../../src/ui/UndoBar'

afterEach(cleanup)

const change: UndoEntry = {
  id: 1,
  week: '2026-10-26',
  label: 'Kati beteg: 10.28.',
  undo: [],
  changed: ['0|2026-10-28'],
}
const noop = () => {}

describe('UndoBar', () => {
  it('lists who changed under a recalculation', () => {
    const details = ['1 munkatárs beosztása változott:', 'Bea: ma DE 6:00–14:00, 1. cs. (eddig …)']
    render(<UndoBar change={{ ...change, details }} busy={false} onUndo={noop} onAccept={noop} />)
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual(details)
  })

  it('shows no list for an ordinary change', () => {
    render(<UndoBar change={change} busy={false} onUndo={noop} onAccept={noop} />)
    expect(screen.queryByRole('list')).toBeNull()
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/i18n/recalcText.test.ts tests/state/sickCall.test.ts tests/ui/changeLines.test.ts tests/ui/UndoBar.test.tsx`
Expected: FAIL — `ui.recalc` undefined, missing modules `sickCall` and `changeLines`, no list rendered.

- [ ] **Step 3: Texts in `src/i18n/hu.ts`**

Replace the two import lines at the top with:

```ts
import { weekday } from '../core/calendar'
import { shiftTimes } from '../core/shifts'
import type { AbsenceKind, Assignment, Role, Shift } from '../core/types'
```

After `formatDate` add:

```ts
/** '10.28.' */
export function shortDate(date: string): string {
  const [, month, day] = date.split('-')
  return `${month}.${day}.`
}
```

In `ui`, after the `roster: { … },` block and before `print: {`, add:

```ts
  recalc: {
    started: 'A hét már elkezdődött — a korábbi napok változatlanok maradnak.',
    minimal: 'Csak a szükséges változtatások',
    minimalHint: 'A lehető legkevesebb munkatárs beosztása változik, a többieké marad.',
    full: 'Mától mindent újraszámol',
    fullHint:
      'Mától az egész hetet újraosztja az egyenlő elosztás szerint — sok beosztás változhat.',
    sick: 'Beteg lett…',
    sickUntil: (name: string, date: string) => `${name} beteg ${fromDay(date)} — meddig?`,
    sickGo: 'Beteg — újraszámol',
    didSick: (name: string, from: string, to: string) =>
      `${name} beteg: ${shortDate(from)}${to > from ? `–${shortDate(to)}` : ''}.`,
    changedPeople: (count: number) =>
      count === 0
        ? 'Senki más beosztása nem változott.'
        : `${count} munkatárs beosztása változott:`,
    /** 'DE 6:00–14:00, 2. cs., nyit' */
    dayText: (role: Role, a: Assignment) =>
      `${shiftShort[a.shift]} ${shiftTimes(role, a.shift, a.date)}, ${
        a.seat ? groupShort(a.seat.group) : 'csoporton kívül'
      }${a.opener ? ', nyit' : a.closer ? ', zár' : ''}`,
    change: (name: string, date: string, isToday: boolean, now: string, was: string) =>
      `${name}: ${isToday ? 'ma' : onDay(date)} ${now} (eddig ${was})`,
  },
```

Check that `src/core/shifts.ts` imports nothing from `hu.ts` (it imports only `calendar`), so no cycle appears.

- [ ] **Step 4: `src/state/sickCall.ts`**

```ts
import { addDays, isWorkingDay } from '../core/calendar'
import type { Action, AppState } from './appState'

/** The working days from `from` to `to`, both included. */
export function workingDaysBetween(from: string, to: string): string[] {
  const out: string[] = []
  for (let date = from; date <= to; date = addDays(date, 1)) {
    if (isWorkingDay(date)) out.push(date)
  }
  return out
}

/**
 * "Beteg lett": marks `staffId` sick on every working day from `from` to `to`, with the actions
 * that put back exactly what those days held — nothing, or the leave she had typed.
 */
export function sickCall(
  state: AppState,
  staffId: string,
  from: string,
  to: string,
): { dates: string[]; action: Action; inverse: Action[] } {
  const dates = workingDaysBetween(from, to)
  const before = state.absences.filter((a) => a.staffId === staffId && dates.includes(a.date))
  return {
    dates,
    action: { type: 'setAbsent', staffId, dates, absent: true, kind: 'sick' },
    inverse: [
      { type: 'setAbsent', staffId, dates, absent: false },
      ...before.map(
        (a): Action => ({ type: 'setAbsent', staffId, dates: [a.date], absent: true, kind: a.kind }),
      ),
    ],
  }
}
```

- [ ] **Step 5: `src/ui/changeLines.ts`**

```ts
import { scheduleChanges } from '../core/recalc'
import type { Roster, Staff } from '../core/types'
import { ui } from '../i18n/hu'

/**
 * What a recalculation changed, for the undo bar: how many people, then one line per changed day
 * in date order — today's first, the calls to make now.
 */
export function changeLines(
  before: Roster,
  after: Roster,
  from: string,
  staff: Staff[],
  today: string,
): string[] {
  const person = new Map(staff.map((s) => [s.id, s]))
  const name = (id: string) => person.get(id)?.displayName ?? '?'
  const changes = scheduleChanges(before, after, from).sort(
    (a, b) => a.date.localeCompare(b.date) || name(a.staffId).localeCompare(name(b.staffId), 'hu'),
  )
  const lines = changes.map((c) => {
    const role = person.get(c.staffId)?.role ?? 'teacher'
    return ui.recalc.change(
      name(c.staffId),
      c.date,
      c.date === today,
      ui.recalc.dayText(role, c.after),
      ui.recalc.dayText(role, c.before),
    )
  })
  return [ui.recalc.changedPeople(new Set(changes.map((c) => c.staffId)).size), ...lines]
}
```

- [ ] **Step 6: The undo entry carries the lines**

`src/state/undo.ts`, in `UndoEntry` after `changed: string[]`:

```ts
  details?: string[] // a recalculation's changed people, one line each
```

`src/ui/UndoBar.tsx`: after the *Rendben* button, before the closing `</div>`:

```tsx
      {change.details && (
        <ul className="undo-details">
          {change.details.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
```

`src/app/app.css`, after the `.undo-bar span` rule:

```css
.undo-details {
  flex-basis: 100%;
  margin: 0;
  padding-left: 20px;
}
```

- [ ] **Step 7: Run the tests**

Run: `npx vitest run tests/i18n tests/state tests/ui/changeLines.test.ts tests/ui/UndoBar.test.tsx`
Expected: PASS.

- [ ] **Step 8: Typecheck and commit**

```bash
npm run typecheck
npx prettier --write src/i18n/hu.ts src/state/sickCall.ts src/state/undo.ts src/ui/changeLines.ts src/ui/UndoBar.tsx src/app/app.css tests/i18n/recalcText.test.ts tests/state/sickCall.test.ts tests/ui/changeLines.test.ts tests/ui/UndoBar.test.tsx
git add src/i18n/hu.ts src/state/sickCall.ts src/state/undo.ts src/ui/changeLines.ts src/ui/UndoBar.tsx src/app/app.css tests/i18n/recalcText.test.ts tests/state/sickCall.test.ts tests/ui/changeLines.test.ts tests/ui/UndoBar.test.tsx
git commit -m "feat(recalc): sick-call action, texts, and the undo bar's changed-people lines"
```

---

### Task 5: A week in progress asks first; quick fixes change as little as they can

**Files:**
- Modify: `src/ui/RosterScreen.tsx`
- Modify: `src/ui/WarningsPanel.tsx` (`fixFrom`)
- Modify: `src/app/app.css` (`.recalc-choice`)
- Test: `tests/ui/RosterScreen.test.tsx`

- [ ] **Step 1: Write the failing tests**

Append to the end of `tests/ui/RosterScreen.test.tsx` (after the swap `describe`, so `valid`, `wedOnly`, `withValid`, `fixed` and `Harness` exist):

```tsx
describe('RosterScreen week in progress', () => {
  beforeEach(() => vi.setSystemTime(new Date(2026, 9, 28, 12))) // Wednesday
  const kept = (mode: 'minimal' | 'full') => ({ roster: valid, from: WED, mode })

  it('asks how much to change, then keeps the days before today', async () => {
    vi.mocked(solveInWorker).mockResolvedValue(valid)
    render(<Harness initial={withValid} />)
    fireEvent.click(screen.getByText('Számol'))
    expect(
      screen.getByText('A hét már elkezdődött — a korábbi napok változatlanok maradnak.'),
    ).toBeTruthy()
    expect(solveInWorker).not.toHaveBeenCalled()
    fireEvent.click(screen.getByText('Csak a szükséges változtatások'))
    await waitFor(() =>
      expect(solveInWorker).toHaveBeenCalledWith(
        solveInputFor(wedOnly, WEEK),
        expect.any(Object),
        kept('minimal'),
      ),
    )
    expect(await screen.findByText('Senki más beosztása nem változott.')).toBeTruthy()
  })

  it('re-plans everything from today on request', async () => {
    vi.mocked(solveInWorker).mockResolvedValue(valid)
    render(<Harness initial={withValid} />)
    fireEvent.click(screen.getByText('Számol'))
    fireEvent.click(screen.getByText('Mától mindent újraszámol'))
    await waitFor(() =>
      expect(solveInWorker).toHaveBeenCalledWith(
        solveInputFor(wedOnly, WEEK),
        expect.any(Object),
        kept('full'),
      ),
    )
  })

  it('solves nothing on Mégse', () => {
    render(<Harness initial={withValid} />)
    fireEvent.click(screen.getByText('Számol'))
    fireEvent.click(screen.getByText('Mégse'))
    expect(screen.queryByText(/A hét már elkezdődött/)).toBeNull()
    expect(solveInWorker).not.toHaveBeenCalled()
  })

  it('applies a quick fix with as few changes as possible, without asking', async () => {
    vi.mocked(solveInWorker).mockResolvedValue(fixed)
    render(<Harness initial={withRoster(base)} />)
    fireEvent.click(screen.getByText('Szerdán 1 csoport'))
    await waitFor(() =>
      expect(solveInWorker).toHaveBeenCalledWith(expect.any(Object), expect.any(Object), {
        roster,
        from: WED,
        mode: 'minimal',
      }),
    )
  })

  it('offers no fix for a day already over', () => {
    vi.setSystemTime(new Date(2026, 9, 29, 12)) // Thursday
    renderScreen(withRoster(base))
    expect(screen.queryByText('Szerdán 1 csoport')).toBeNull()
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/ui/RosterScreen.test.tsx`
Expected: the five new tests FAIL (Számol solves at once, no choice text, fix still offered on Thursday); the older ones PASS.

- [ ] **Step 3: `fixFrom` in `src/ui/WarningsPanel.tsx`**

In `Props`, after `onFix`:

```ts
  fixFrom?: string // a week in progress: days before this get no fixes, they are over
```

Change the signature to `export function WarningsPanel({ warnings, input, staff, onHover, onFix, fixFrom }: Props)`. In `days.map((day) => {`, after `const headingId = …`, add:

```ts
              const onDayFix = fixFrom === undefined || day.date >= fixFrom ? onFix : undefined
```

and inside that day's JSX replace every `onFix` with `onDayFix`: both `{onFix &&` guards and both `onClick={() => onFix(fix)}` handlers.

- [ ] **Step 4: The choice and the anchored solves in `src/ui/RosterScreen.tsx`**

Imports: add

```ts
import { recalcInput } from '../core/recalc'
import { changeLines } from './changeLines'
```

and change `import type { Warning } from '../core/types'` to `import type { Anchor, Warning } from '../core/types'`.

With the other `useState` calls at the top of the component add:

```ts
  const [choosing, setChoosing] = useState(false)
```

After the `hasRoster` line add:

```ts
  const now = today()
  // Where a week in progress is re-planned from: today, or its next working day.
  const from = days.find((date) => date >= now)
  // Keeps what `kept` planned before `from`; undefined when it no longer fits the week.
  const anchorFor = (mode: Anchor['mode'], kept = roster): Anchor | undefined => {
    if (!kept || from === undefined || archived) return undefined
    const anchor: Anchor = { roster: kept, from, mode }
    return recalcInput(input, anchor) ? anchor : undefined
  }
  // Its first working day has come (Monday counts): solving keeps the past and asks how much.
  const started = days.length > 0 && days[0] <= now && anchorFor('minimal') !== undefined
```

Replace `solve`'s signature and its first lines up to `setSolving(true)`:

```ts
  const solve = async (
    current: AppState,
    change?: { label: string; inverse: Action[] },
    mode?: Anchor['mode'],
  ) => {
    const solveInput = solveInputFor(current, week)
    const before = current.periods[week]
    const undoInput = change?.inverse ?? []
    const anchor = mode ? anchorFor(mode, before?.roster) : undefined
    setSolving(true)
```

Replace the `solveInWorker` call:

```ts
      const meta = { solvedAt: new Date().toISOString(), appVersion: __APP_VERSION__ }
      const result = await (anchor
        ? solveInWorker(solveInput, meta, anchor)
        : solveInWorker(solveInput, meta))
```

and in the `history.record({ … })` inside the `try`, after `changed: [...changed],` add:

```ts
          ...(anchor
            ? { details: changeLines(anchor.roster, result, anchor.from, current.staff, now) }
            : {}),
```

In `fix`, replace the first line `if (!mayDropEdits()) return` with:

```ts
    // In a week in progress a fix changes as little as it can, so it need not ask about edits.
    if (!started && !mayDropEdits()) return
```

and its last line with:

```ts
    void solve(reducer(state, action), { label, inverse: [inverse] }, started ? 'minimal' : undefined)
```

Add, after `fix`:

```ts
  // Számol and Újraszámol: a week in progress first asks how much may change.
  const askSolve = () => {
    if (started) return setChoosing(true)
    if (mayDropEdits()) void solve(state)
  }
```

Both buttons that did `onClick={() => mayDropEdits() && void solve(state)}` (the big Számol and the stale banner's Újraszámol) become `onClick={askSolve}`.

Right after `{error && <p className="error">{error}</p>}` add:

```tsx
        {choosing && (
          <div className="recalc-choice" role="group">
            <span>{ui.recalc.started}</span>
            <button
              className="primary"
              title={ui.recalc.minimalHint}
              onClick={() => {
                setChoosing(false)
                void solve(state, undefined, 'minimal')
              }}
            >
              {ui.recalc.minimal}
            </button>
            <button
              title={ui.recalc.fullHint}
              onClick={() => {
                setChoosing(false)
                if (mayDropEdits()) void solve(state, undefined, 'full')
              }}
            >
              {ui.recalc.full}
            </button>
            <button onClick={() => setChoosing(false)}>{ui.roster.cancel}</button>
          </div>
        )}
```

On `<WarningsPanel …>` add `fixFrom={started ? from : undefined}`.

`src/app/app.css`, after the `.swap-bar` rule:

```css
.recalc-choice {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 12px;
  align-items: center;
  margin: 10px 0;
  padding: 8px 12px;
  border: 2px solid var(--green);
  border-radius: 8px;
  background: var(--surface);
}
```

- [ ] **Step 5: Run the screen tests**

Run: `npx vitest run tests/ui`
Expected: PASS, the older RosterScreen tests included. They run on 2026-10-05, before the week starts, so Számol still solves at once and `solveInWorker` still gets two arguments.

- [ ] **Step 6: Typecheck and commit**

```bash
npm run typecheck
npx prettier --write src/ui/RosterScreen.tsx src/ui/WarningsPanel.tsx src/app/app.css tests/ui/RosterScreen.test.tsx
git add src/ui/RosterScreen.tsx src/ui/WarningsPanel.tsx src/app/app.css tests/ui/RosterScreen.test.tsx
git commit -m "feat(recalc): a week in progress asks before solving and keeps its past"
```

---

### Task 6: "Beteg lett…" from the roster

**Files:**
- Modify: `src/ui/RosterScreen.tsx`
- Test: `tests/ui/RosterScreen.test.tsx`

- [ ] **Step 1: Write the failing tests**

Append to `tests/ui/RosterScreen.test.tsx`:

```tsx
describe('RosterScreen sick call', () => {
  beforeEach(() => vi.setSystemTime(new Date(2026, 9, 28, 8))) // Wednesday morning
  // T2 is off sick; T4, the morning reserve, takes her seat.
  const covered: Roster = {
    ...valid,
    assignments: valid.assignments
      .filter((a) => a.staffId !== 't2')
      .map((a) =>
        a.staffId === 't4' ? { ...a, seat: { kind: 'teacher', group: 1, shift: 'morning' } } : a,
      ),
  }

  it('marks the days sick, re-plans with as few changes as possible, and undoes both', async () => {
    vi.mocked(solveInWorker).mockResolvedValue(covered)
    render(<Harness initial={withValid} />)
    fireEvent.click(screenTable().getByText('DE: T2'))
    fireEvent.click(screen.getByText('Beteg lett…'))
    fireEvent.change(screen.getByLabelText('T2 beteg szerdától — meddig?'), {
      target: { value: '2026-10-29' },
    })
    fireEvent.click(screen.getByText('Beteg — újraszámol'))
    const sick = reducer(wedOnly, {
      type: 'setAbsent',
      staffId: 't2',
      dates: [WED, '2026-10-29'],
      absent: true,
      kind: 'sick',
    })
    await waitFor(() =>
      expect(solveInWorker).toHaveBeenCalledWith(solveInputFor(sick, WEEK), expect.any(Object), {
        roster: valid,
        from: WED,
        mode: 'minimal',
      }),
    )
    expect(await screen.findByText('T2 beteg: 10.28.–10.29.')).toBeTruthy()
    expect(screen.getByText('1 munkatárs beosztása változott:')).toBeTruthy()
    expect(
      screen.getByText('T4: ma DE 7:00–13:30, 1. cs. (eddig DE 7:00–13:30, csoporton kívül)'),
    ).toBeTruthy()
    fireEvent.click(screen.getByText('↶ Visszavonás'))
    expect(screenTable().getByText('DE: T2')).toBeTruthy()
    expect(screen.queryByText(/változott a számolás óta/)).toBeNull()
  })

  it('offers no sick call for a day already over', () => {
    vi.setSystemTime(new Date(2026, 9, 29, 8)) // Thursday
    render(<Harness initial={withValid} />)
    fireEvent.click(screenTable().getByText('DE: T2'))
    expect(screen.getByText(/kiválasztva/)).toBeTruthy()
    expect(screen.queryByText('Beteg lett…')).toBeNull()
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/ui/RosterScreen.test.tsx`
Expected: the two new tests FAIL: there is no *Beteg lett…* button. (The Thursday test only fails once the button exists for Wednesday; until then it passes, which is fine.)

- [ ] **Step 3: Implement in `src/ui/RosterScreen.tsx`**

Import:

```ts
import { sickCall } from '../state/sickCall'
```

With the other `useState` calls:

```ts
  const [sick, setSick] = useState<{ staffId: string; date: string; until: string }>()
```

After `askSolve` add:

```ts
  // "Beteg lett": mark the days sick, then change as few people as possible.
  const reportSick = ({ staffId, date, until }: { staffId: string; date: string; until: string }) => {
    setSick(undefined)
    const last = until < date ? date : until
    const call = sickCall(state, staffId, date, last)
    dispatch(call.action)
    void solve(
      reducer(state, call.action),
      { label: ui.recalc.didSick(nameOf(staffId), date, last), inverse: call.inverse },
      'minimal',
    )
  }
```

Replace the `{picked && ( … )}` swap bar with:

```tsx
        {picked && (
          <div className="swap-bar" aria-live="polite">
            <span>{ui.roster.picked(nameOf(picked.staffId), picked.date)}</span>
            {from !== undefined && picked.date >= from && (
              <button
                onClick={() => {
                  setSick({ ...picked, until: picked.date })
                  setPicked(undefined)
                }}
              >
                {ui.recalc.sick}
              </button>
            )}
            <button onClick={() => setPicked(undefined)}>{ui.roster.cancel}</button>
          </div>
        )}
        {sick && (
          <div className="swap-bar" aria-live="polite">
            <label>
              {ui.recalc.sickUntil(nameOf(sick.staffId), sick.date)}{' '}
              <input
                type="date"
                min={sick.date}
                value={sick.until}
                onChange={(event) => setSick({ ...sick, until: event.target.value || sick.date })}
              />
            </label>
            <button className="primary" disabled={solving} onClick={() => reportSick(sick)}>
              {ui.recalc.sickGo}
            </button>
            <button onClick={() => setSick(undefined)}>{ui.roster.cancel}</button>
          </div>
        )}
```

- [ ] **Step 4: Run the screen tests**

Run: `npx vitest run tests/ui`
Expected: PASS.

- [ ] **Step 5: Typecheck and commit**

```bash
npm run typecheck
npx prettier --write src/ui/RosterScreen.tsx tests/ui/RosterScreen.test.tsx
git add src/ui/RosterScreen.tsx tests/ui/RosterScreen.test.tsx
git commit -m "feat(recalc): Beteg lett… from a picked name, until the day she sets"
```

---

### Task 7: The spec catches up

**Files:**
- Modify: `docs/spec.md` (§6.5, §8.3, §13), `docs/specs/2026-09-28-sick-call-design.md` (status)

- [ ] **Step 1: §6.5**

After item 7 (**Yearly balance**) and before *"Six solves of ~500 binaries…"*, add:

```markdown
**A week in progress** (v2-F, `docs/specs/2026-09-28-sick-call-design.md`) is solved with an
anchor, the saved roster. The days before `from` (the first working day that is today or later)
are fixed as planned; who worked them is read from the anchor, not from absences typed since. In
the default *minimal* mode three stages come right after substitutions:

- **keepPeople**: people whose hours change.
- **keepHours**: their changed days, an earlier day costing more.
- **keepDuties**: seat and key moves at unchanged hours.

So a reserve on the same shift fills in first, and stability beats fairness; the yearly balance
evens out the difference. *Full* mode keeps only the fixed past.
```

- [ ] **Step 2: §8.3**

After the **Swap two people** bullet add:

```markdown
- **A week in progress** (its first working day has come): Számol and Újraszámol first ask
  *"A hét már elkezdődött — a korábbi napok változatlanok maradnak."* with **Csak a szükséges
  változtatások** (default) or **Mától mindent újraszámol**. Quick fixes use the first without
  asking, and days already over get no fix buttons.
- **Beteg lett…**: a picked name on today or a later day offers it next to *Mégse*;
  *"Kati beteg keddtől — meddig?"* takes the last sick day, marks every working day up to it
  *beteg*, and recalculates with the fewest changes. The undo bar then lists whom to phone
  (*"1 munkatárs beosztása változott:"*, one line per changed day, today's first). Undo puts back
  the absences and the roster together.
```

- [ ] **Step 3: §13**

Replace the **Recalculation after a sick call** bullet and the sentence before it (*"Left: the sick-call recalculation, and whatever her demo feedback adds."*) with:

```markdown
(A warning names · B swap · C yearly balance · D absence kinds · E month overview); all five landed
on 2026-09-27 and are described in the sections above. **F, the sick-call recalculation**
(`docs/specs/2026-09-28-sick-call-design.md`, `docs/plans/2026-09-28-v2-f-sick-call.md`), is
described in §6.5 and §8.3. Left: whatever her demo feedback adds.
```

(The first line of this replacement restates the list that ends the previous line of §13, so
make sure the paragraph still reads as one sentence after the edit.)

- [ ] **Step 4: Design status**

In `docs/specs/2026-09-28-sick-call-design.md` change the status line to
`Status: **agreed with the user, 2026-09-28; implemented** (plan v2-F).`

- [ ] **Step 5: Commit**

```bash
npx prettier --write docs/spec.md docs/specs/2026-09-28-sick-call-design.md
git add docs/spec.md docs/specs/2026-09-28-sick-call-design.md
git commit -m "docs: spec §6.5, §8.3 and §13 describe the sick-call recalculation"
```

---

### Task 8: Verify everything, then the PR

- [ ] **Step 1: The full gate CI runs**

```bash
npm test
npm run typecheck
npm run format:check
npm run build
```

Expected: all green. The build writes `dist/` (ignored by git).

- [ ] **Step 2: See it in the browser**

`npm run dev`, open the app, and load the demo data (*Demó adatok*). Then:

1. Go to the demo week and press Számol while it is still in the future: it solves at once, no question.
2. In the browser devtools set the clock forward, or temporarily edit `today()` in `src/ui/dates.ts` to return the demo week's Wednesday. **Revert that edit afterwards.** Then:
   - Click a nanny's name on Wednesday, then **Beteg lett…**, set Thursday, and press **Beteg — újraszámol**.
   - Check: Monday and Tuesday are unchanged; 1–2 people are listed in the undo bar; the outlined cells match the list.
   - **↶ Visszavonás** brings back the old roster and removes the sick days from Távollétek.
3. Mark a teacher absent in Távollétek for Thursday, come back, and press Számol: the choice appears. Check that *Mégse* does nothing.

- [ ] **Step 3: Push and open the PR**

```bash
git push -u origin v2-f-sick-call
gh pr create --title "v2-F: sick-call recalculation" --body "$(cat <<'EOF'
In a week in progress a sick call no longer re-solves the whole week: the days already over stay as planned, and the rest changes as few people as possible (keepPeople → keepHours → keepDuties, ahead of fairness).

- Beteg lett… next to a picked name, until the day she sets
- Számol in a started week asks: only the needed changes, or everything from today
- quick fixes in a started week use the fewest-changes mode; no fixes for days already over
- the undo bar lists whom to phone
- watchdog 150 s → 180 s (up to 10 stages)

Design: docs/specs/2026-09-28-sick-call-design.md · Plan: docs/plans/2026-09-28-v2-f-sick-call.md

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: CI green on the PR. Merging to `main` deploys.
