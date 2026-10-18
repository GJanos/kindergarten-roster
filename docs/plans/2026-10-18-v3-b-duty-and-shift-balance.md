# v3-b — ügyelet, nanny pairs, DE/DU balance, keys demoted — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The solver plans a daily ügyelet group, keeps paired groups' nannies on opposite
shifts, evens out DE/DU each day, takes the keys from seated nannies, and demotes the
opener/closer split to a minor stage.

**Architecture:**
- New MILP variables and four new stages in `src/core/model.ts`, with nothing else in the
  pipeline changing shape.
- The roster carries `Assignment.duty` and a `{ kind: 'duty' }` hole.
- The checks that read only the finished roster follow it, so hand edits stay covered:
  `validate`, `explain`/`metrics`, `views`, recalc and swaps.
- Time limits double. Her slow laptop is fine with waits of a minute or more.

**Tech Stack:** TypeScript, HiGHS (MILP via `highs` WASM), Vitest.

Spec: `docs/specs/2026-10-17-v3-b-duty-and-shift-balance-design.md`. Run from
`Projects/kindergarten-roster`. Tests mirror `src/` under `tests/`. **After every task run the
whole suite (`npm test`), not just the new test.** Model changes move solver output, and a test
asserting an exact warning list or exact assignment can shift. For each such failure:
1. Read the new roster.
2. Update the expectation **only if** the new output follows her rules (ügyelet present, pairs
   split, keys from seats).
3. Note it in the commit message.

A failure that breaks a strict rule is a bug to fix, never an expectation to update.

## Files

| File | Change |
| --- | --- |
| `src/core/types.ts` | `GapKind` `'duty'`, `Assignment.duty`, `duty` hole, 3 warning codes |
| `src/core/shifts.ts` | ügyelet times |
| `src/core/fairness.ts` | duty share and count |
| `src/core/validate.ts` | ügyelet rules |
| `src/core/model.ts` | ügyelet, pairs, balance, keys-seated; stage order; keys out of `worstGap` |
| `src/core/solve.ts` | decode duty; time limits |
| `src/core/edit.ts` | duty follows the seat |
| `src/core/recalc.ts` | pin past duty, duty counts in `keepHours`, `scheduleChanges` |
| `src/core/metrics.ts` | `pairClashes`, `shiftImbalances` |
| `src/core/explain.ts` | `DUTY_MISSING`, `PAIR_SAME`, `SHIFT_IMBALANCE`; no UNEVEN for keys |
| `src/i18n/hu.ts` | texts, legend, phone-list duty, solving note |
| `src/export/views.ts` | ügyelet lines in both views |
| `src/state/history.ts`, `src/ui/YearBalance.tsx` | Ügyelet column |
| `src/worker/client.ts` | watchdog |
| `scripts/time-weeks.ts` | new: per-stage timing on a backup |
| `README.md`, `docs/spec.md` | rules and stage order |

---

### Task 1: Types and ügyelet times

**Files:** Modify `src/core/types.ts`, `src/core/shifts.ts`, `tests/core/properties.test.ts`.
Test: `tests/core/shifts.test.ts`.

- [ ] **Step 1: Failing test.** Append to `tests/core/shifts.test.ts`, inside the `describe`:

```ts
  it('shifts an ügyelet teacher 30 minutes: earlier in the morning, later in the afternoon', () => {
    expect(shiftTimes('teacher', 'morning', '2026-10-29', true)).toBe('6:30–13:00')
    expect(shiftTimes('teacher', 'afternoon', '2026-10-29', true)).toBe('11:00–17:30')
    expect(shiftTimes('teacher', 'morning', '2026-10-30', true)).toBe('6:30–12:30')
    expect(shiftTimes('teacher', 'afternoon', '2026-12-12', true)).toBe('11:30–17:30')
    expect(shiftTimes('nanny', 'morning', '2026-10-29', true)).toBe('6:00–14:00')
  })
```

- [ ] **Step 2:** Run `npx vitest run tests/core/shifts.test.ts`. Expected: FAIL (`7:00–13:30`
  ≠ `6:30–13:00`).

- [ ] **Step 3: Implement.** Replace `src/core/shifts.ts`:

```ts
import { usesFridayTimes } from './calendar'
import type { Role, Shift } from './types'

/**
 * Fixed shift times (spec §2): never optimised, never stretched. Ügyelet (v3-b) moves a teacher's
 * shift 30 minutes — the morning one earlier, the afternoon one later — at the same length.
 */
export function shiftTimes(role: Role, shift: Shift, date: string, duty = false): string {
  if (role === 'nanny') return shift === 'morning' ? '6:00–14:00' : '10:00–18:00'
  const friday = usesFridayTimes(date)
  if (duty) {
    if (shift === 'morning') return friday ? '6:30–12:30' : '6:30–13:00'
    return friday ? '11:30–17:30' : '11:00–17:30'
  }
  if (friday) return shift === 'morning' ? '7:00–13:00' : '11:00–17:00'
  return shift === 'morning' ? '7:00–13:30' : '10:30–17:00'
}
```

  In `src/core/types.ts`:
  - `GapKind` → `'morning' | 'opener' | 'closer' | 'reserve' | 'duty'`, with the comment
    `/** The fairness counts (spec §6.3; 'duty' since v3-b). */`.
  - In `Assignment`, after `closer?: true`, add
    `duty?: true // ügyelet (v3-b): a teacher of the day's ügyelet group, shifted 30 minutes`.
  - `Hole`'s second member → `{ kind: 'opener' | 'closer' | 'duty'; date: string }`.
  - `WarningCode`: add `| 'DUTY_MISSING' | 'PAIR_SAME' | 'SHIFT_IMBALANCE'`.

  In `tests/core/properties.test.ts`, add `duty: 'DUTY_MISSING',` to `warningFor`.

- [ ] **Step 4:** Run `npx vitest run tests/core/shifts.test.ts`. Expected: PASS. Then run
  `npm run typecheck`. Expected: errors only in `explain.ts` (the `SEVERITY` record lacks the new
  codes, and the `else` branch treats `duty` as a key) and `history.ts` (`YearCounts` lacks
  `duty`). Later tasks fix them. Make the build green now with minimal stubs:
  - `SEVERITY` gets `DUTY_MISSING: 'red', PAIR_SAME: 'grey', SHIFT_IMBALANCE: 'grey',`.
  - `yearTotals`'s `counts` initialiser gets `duty: 0`.
  - In `explain.ts`, change `} else {` (the key-hole branch) to
    `} else if (hole.kind !== 'duty') {`.

  Run `npm run typecheck`. Expected: clean.

- [ ] **Step 5:** Run `npm test`. `tests/state/history.test.ts` (`yearTotals … toEqual`) now
  needs `duty: 0` in each expected `counts`, so add it there. Then everything passes. Commit:

```bash
git add src/core/types.ts src/core/shifts.ts src/core/explain.ts src/state/history.ts tests/core/shifts.test.ts tests/core/properties.test.ts tests/state/history.test.ts
git commit -m "feat(core): ügyelet types and its shifted teacher times"
```

---

### Task 2: Duty share and count

**Files:** Modify `src/core/fairness.ts`. Test: `tests/core/fairness.test.ts`.

- [ ] **Step 1: Failing test.** Append inside `describe('fairShares', …)`:

```ts
  it('deals two ügyelet seats a day over the teachers, on days with 2 or more full groups', () => {
    const input = makeInput({ teachers: 5, nannies: 2, groups: 2, days: WEEK.slice(0, 2) })
    const duty = fairShares(input).filter((s) => s.kind === 'duty')
    expect(duty).toHaveLength(5)
    // 2 days × 2 seats = 4 duty days over 10 teacher-days.
    expect(duty[0]).toMatchObject({ staffId: 't1', num: 8, den: 10, pool: 'duty' })
    expect(duty[0].days).toEqual(WEEK.slice(0, 2))
  })

  it('leaves out 1-group days (duty is forced) and days with an empty teacher seat', () => {
    const one = makeInput({ teachers: 3, nannies: 2, groups: 1, days: WEEK.slice(0, 2) })
    expect(fairShares(one).filter((s) => s.kind === 'duty')).toEqual([])
    const short = makeInput({ teachers: 3, nannies: 2, groups: 2, days: WEEK.slice(0, 1) })
    expect(fairShares(short).filter((s) => s.kind === 'duty')).toEqual([])
  })
```

- [ ] **Step 2:** Run `npx vitest run tests/core/fairness.test.ts`. Expected: the 2 new tests
  FAIL (no duty shares).

- [ ] **Step 3: Implement.** In `fairShares`, before `return shares`, add:

```ts
  // Ügyelet days (v3-b): two duty seats a day, on days with 2+ groups and every teacher seat
  // fillable. A 1-group day's duty is forced, and a short day may have none, so both stay out.
  const dutyDays = open
    .filter(
      (c) => c.groups >= 2 && c.teachers - Math.max(0, c.groups - c.nannies) >= 2 * c.groups,
    )
    .map((c) => c.date)
  const dutyHolders = people
    .filter((s) => s.role === 'teacher')
    .map((s) => ({ staffId: s.id, days: presentOn(s.id, dutyDays) }))
    .filter((m) => m.days.length > 0)
  const dutyHolderDays = dutyHolders.reduce((sum, m) => sum + m.days.length, 0)
  for (const { staffId, days } of dutyHolders) {
    shares.push({
      staffId,
      kind: 'duty',
      days,
      num: 2 * dutyDays.length * days.length,
      den: dutyHolderDays,
      pool: 'duty',
    })
  }
```

  In the `counts` record add `duty: (a) => a.duty === true,`.

- [ ] **Step 4:** Run `npx vitest run tests/core/fairness.test.ts`. Expected: PASS. **Don't run
  the full suite yet.** The model doesn't know `duty` shares until Task 4, and `buildModel` would
  treat them as reserve counts. Go straight to Task 3 and Task 4, and commit Task 2 together with
  Task 4.

---

### Task 3: Validate the ügyelet rules

**Files:** Modify `src/core/validate.ts`. Test: `tests/core/validate.test.ts`.

- [ ] **Step 1: Failing tests.** Append to `tests/core/validate.test.ts` (it has `setup`,
  `dayOf`, `D`):

```ts
describe('ügyelet (v3-b)', () => {
  const withDuty = () => {
    const { input, roster } = setup()
    roster.assignments = roster.assignments.map((a) =>
      a.seat?.kind === 'teacher' ? { ...a, duty: true } : a,
    )
    return { input, roster }
  }

  it("accepts the group's two teachers on duty", () => {
    const { input, roster } = withDuty()
    expect(validateRoster(input, roster)).toEqual([])
  })

  it('accepts a roster from before v3-b, with no duty at all', () => {
    const { input, roster } = setup()
    expect(validateRoster(input, roster)).toEqual([])
  })

  it('rejects duty on only one of the two teachers', () => {
    const { input, roster } = withDuty()
    roster.assignments = roster.assignments.map((a) =>
      a.staffId === 't2' ? { ...a, duty: undefined } : a,
    )
    expect(validateRoster(input, roster).map((v) => v.rule)).toContain('dutyGroupIncomplete')
  })

  it('rejects duty outside a teacher seat', () => {
    const { input, roster } = withDuty()
    roster.assignments = roster.assignments.map((a) =>
      a.staffId === 'n2' ? { ...a, duty: true } : a,
    )
    expect(validateRoster(input, roster).map((v) => v.rule)).toContain('dutyOffTeacherSeat')
  })

  it('rejects a day with both a duty group and a duty hole', () => {
    const { input, roster } = withDuty()
    roster.holes = [{ kind: 'duty', date: D }]
    expect(validateRoster(input, roster).map((v) => v.rule)).toContain('dutyNotExactlyOne')
  })
})
```

- [ ] **Step 2:** Run `npx vitest run tests/core/validate.test.ts`. Expected: 3 new tests FAIL.

- [ ] **Step 3: Implement.** In `validateRoster`, after `const capacities = dayCapacities(input)`:

```ts
  // Ügyelet (v3-b): a roster from before it has neither duty nor a duty hole, and is left alone.
  const tracksDuty =
    roster.assignments.some((a) => a.duty) || roster.holes.some((h) => h.kind === 'duty')
```

  Inside the per-day loop, after the `for (const key of ['opener', 'closer'] as const) { … }`
  block (the one counting holders and holes):

```ts
    if (tracksDuty) {
      for (const a of today) {
        if (a.duty && a.seat?.kind !== 'teacher') fail('dutyOffTeacherSeat', date, a.staffId)
      }
      const dutyGroups = new Set(
        today.flatMap((a) => (a.duty && a.seat?.kind === 'teacher' ? [a.seat.group] : [])),
      )
      const dutyHoles = holes.filter((h) => h.kind === 'duty').length
      if (cap.groups > 0 && dutyGroups.size + dutyHoles !== 1) fail('dutyNotExactlyOne', date)
      for (const g of dutyGroups) {
        const seated = today.filter((a) => a.seat?.kind === 'teacher' && a.seat.group === g)
        if (seated.length !== 2 || seated.some((a) => !a.duty)) fail('dutyGroupIncomplete', date)
      }
    }
```

- [ ] **Step 4:** Run `npx vitest run tests/core/validate.test.ts`. Expected: PASS. Commit:

```bash
git add src/core/validate.ts tests/core/validate.test.ts
git commit -m "feat(validate): one ügyelet group a day, both its teachers"
```

---

### Task 4: Ügyelet in the model, stage order, keys demoted

**Files:** Modify `src/core/model.ts`, `src/core/solve.ts`. Test: `tests/core/model.test.ts`,
`tests/core/solve.test.ts`.

- [ ] **Step 1: Failing tests.** Append to `tests/core/model.test.ts`:

```ts
describe('ügyelet (v3-b)', () => {
  const dutyGroupOf = (roster: ReturnType<typeof solveValid>, date: string) => {
    const groups = roster.assignments
      .filter((a) => a.date === date && a.duty)
      .map((a) => (a.seat?.kind === 'teacher' ? a.seat.group : 0))
    return [...new Set(groups)]
  }

  it('puts exactly one group on duty every day, both its teachers', () => {
    const roster = solveValid(makeInput({ teachers: 8, nannies: 5, groups: 4 }))
    for (const date of roster.period.days) {
      expect(dutyGroupOf(roster, date)).toHaveLength(1)
      expect(roster.assignments.filter((a) => a.date === date && a.duty)).toHaveLength(2)
    }
    expect(roster.holes).toEqual([])
  })

  it('spreads duty evenly: 8 teachers, 5 days, 10 duty days → each has 1 or 2', () => {
    const roster = solveValid(makeInput({ teachers: 8, nannies: 5, groups: 4 }))
    const perTeacher = ['t1', 't2', 't3', 't4', 't5', 't6', 't7', 't8'].map(
      (id) => roster.assignments.filter((a) => a.staffId === id && a.duty).length,
    )
    expect(Math.min(...perTeacher)).toBeGreaterThanOrEqual(1)
    expect(Math.max(...perTeacher)).toBeLessThanOrEqual(2)
  })

  it('reports a duty hole when no group has both teachers', () => {
    const roster = solveValid(makeInput({ teachers: 2, nannies: 2, groups: 2, days: [D] }))
    expect(roster.holes).toContainEqual({ kind: 'duty', date: D })
  })
})
```

  In `tests/core/solve.test.ts`, rewrite the test *"gives the year balance a shorter limit…"* so
  it no longer counts stages:
  - Its stub's trigger becomes
    `if (options?.time_limit !== YEARLY_TIME_LIMIT || result.Status !== 'Optimal') return result`.
  - The assertions become:

```ts
    expect(limits.at(-1)).toBe(YEARLY_TIME_LIMIT)
    expect(limits.slice(0, -1).every((limit) => limit === STAGE_TIME_LIMIT)).toBe(true)
    expect(YEARLY_TIME_LIMIT).toBeLessThan(STAGE_TIME_LIMIT)
    expect(roster.stoppedEarly).toBeUndefined()
    expect(validateRoster(input, roster)).toEqual([])
```

  (Delete the `toHaveLength(6)` line and its stage-list comment.)

- [ ] **Step 2:** Run `npx vitest run tests/core/model.test.ts`. Expected: the 3 ügyelet tests
  FAIL (no duty).

- [ ] **Step 3: Stages.** In `src/core/model.ts`:

```ts
export const STAGES = [
  'holes',
  'substitutions',
  'keepPeople',
  'keepHours',
  'keepDuties',
  'pairs',
  'worstGap',
  'totalGap',
  'balance',
  'switches',
  'turnarounds',
  'keysSeated',
  'keysGap',
  'yearly',
] as const
```

  Add `'pairs'`, `'balance'` and `'keysSeated'` to `INTEGRAL_STAGES`. Each counts whole
  violations, so its optimum is a whole number. Update the `STAGES` doc comment to
  *"Solve stages in strict priority order (spec §6.5, reordered in v3-b)."*

- [ ] **Step 4: Variable names.** Add to `v`:

```ts
  dutyGroup: (d: number, g: number) => `y_${d}_${g}`,
  holeDuty: (d: number) => `hd_${d}`,
  onDuty: (p: number, d: number, g: number) => `z_${p}_${d}_${g}`,
  nannyShift: (d: number, g: number, t: Shift) => `ns_${d}_${g}_${t[0]}`,
  pairClash: (d: number, g: number) => `pc_${d}_${g}`,
  imbalance: (d: number, role: 'teacher' | 'nanny', step: 1 | 2) => `e${step}_${d}_${role[0]}`,
  keyFromReserve: (key: 'open' | 'close', p: number, d: number) => `k${key[0]}_${p}_${d}`,
```

  Add `duty: Lin[][]` to `RosterModel` with the doc comment *"Per day, per person: their
  ügyelet (sums to 0 or 1; empty for nannies)."* Return it from `buildModel`.

- [ ] **Step 5: Ügyelet variables.** In `buildModel`, right after the strict-rules loop (before
  *"Nobody opens, or closes, on every working day"*), add:

```ts
  // ── Ügyelet (v3-b): one group a day, both its teachers on duty, or a hole ─
  const duty = days.map(() => people.map(() => new Lin()))
  for (const day of days) {
    if (day.groups === 0) continue // no teacher at all: no group, no duty
    const d = day.index
    const choice = new Lin().add(milp.binary(v.holeDuty(d)))
    objectives.holes.add(v.holeDuty(d))
    for (const g of groupNumbers(day.groups)) {
      const y = milp.binary(v.dutyGroup(d, g))
      choice.add(y)
      for (const t of SHIFTS) milp.constrain(Lin.sum([y, v.holeTeacher(d, g, t)]), '<=', 1)
      for (const p of day.present.filter(isTeacher)) {
        // z = seated in g AND g on duty, exactly (both are binaries).
        const seated = Lin.sum(SHIFTS.map((t) => v.teacherSeat(p, d, g, t)))
        const z = milp.nonNegative(v.onDuty(p, d, g))
        milp.constrain(new Lin().add(z), '<=', seated)
        milp.constrain(new Lin().add(z), '<=', new Lin().add(y))
        milp.constrain(new Lin().add(z), '>=', new Lin().plus(seated).add(y).addConstant(-1))
        duty[d][p].add(z)
      }
    }
    milp.constrain(choice, '=', 1)
  }
```

- [ ] **Step 6: Fairness split.** In the fairness loop:
  - Extend the `count` expression with a duty branch before the reserve fallback:
    `: share.kind === 'duty' ? ds.reduce((sum, d) => sum.plus(duty[d][p]), new Lin())`.
  - Replace the two lines `milp.constrain(new Lin().add(worst), '>=', new Lin().add(gap))` and
    `objectives.totalGap.add(gap)` with:

```ts
    if (share.kind === 'opener' || share.kind === 'closer') {
      objectives.keysGap.add(gap) // demoted in v3-b: the hours are the same either way
    } else {
      milp.constrain(new Lin().add(worst), '>=', new Lin().add(gap))
      objectives.totalGap.add(gap)
    }
```

  - Change the floor to
    `worstGapFloor(shares.filter((s) => s.kind !== 'opener' && s.kind !== 'closer'))`.

- [ ] **Step 7: Decode.** In `src/core/solve.ts` `decode`, after the per-person loop of a day
  (before the teacher-hole loop):

```ts
    const dutyGroup = groups.find((g) => on(v.dutyGroup(d, g)))
    for (const a of assignments) {
      if (a.date === day.date && a.seat?.kind === 'teacher' && a.seat.group === dutyGroup)
        a.duty = true
    }
```

  After the opener/closer hole lines, add
  `if (on(v.holeDuty(d))) holes.push({ kind: 'duty', date: day.date })`.

- [ ] **Step 8:** Run `npx vitest run tests/core/model.test.ts tests/core/fairness.test.ts tests/core/solve.test.ts tests/core/yearly.test.ts`.
  Expected: PASS. Then run `npm test`, and handle any fallout as described at the top. Likely
  spots:
  - `tests/core/recalc.test.ts`: the hand-made `wall` roster has no duty. Add `duty: true` to its
    `t1` and `t2` entries, so a recalc doesn't count giving them duty as an hours change.
  - Explain tests that list exact warnings.

- [ ] **Step 9: Commit** (Tasks 2 and 4 together):

```bash
git add src/core/fairness.ts src/core/model.ts src/core/solve.ts tests/core
git commit -m "feat(solver): a daily ügyelet group, fair across teachers; keys leave the main fairness stage"
```

---

### Task 5: Nanny pairs, daily balance, keys from a seat

**Files:** Modify `src/core/model.ts`. Test: `tests/core/model.test.ts`.

- [ ] **Step 1: Failing tests.** Append to `tests/core/model.test.ts`:

```ts
describe('her v3-b soft rules', () => {
  const nannyShift = (roster: ReturnType<typeof solveValid>, date: string, g: number) =>
    roster.assignments.find((a) => a.date === date && a.seat?.kind === 'nanny' && a.seat.group === g)
      ?.shift

  it('splits each pair of groups: one nanny DE, the other DU', () => {
    const roster = solveValid(makeInput({ teachers: 8, nannies: 5, groups: 4 }))
    for (const date of roster.period.days) {
      expect(nannyShift(roster, date, 1)).not.toBe(nannyShift(roster, date, 2))
      expect(nannyShift(roster, date, 3)).not.toBe(nannyShift(roster, date, 4))
    }
  })

  it('keeps each day within one between DE and DU, per role', () => {
    const roster = solveValid(makeInput({ teachers: 9, nannies: 6, groups: 4 }))
    for (const date of roster.period.days) {
      for (const prefix of ['t', 'n']) {
        const today = roster.assignments.filter((a) => a.date === date && a.staffId[0] === prefix)
        const morning = today.filter((a) => a.shift === 'morning').length
        expect(Math.abs(2 * morning - today.length)).toBeLessThanOrEqual(1)
      }
    }
  })

  it('takes the keys from seated nannies when one is on the right shift', () => {
    // One day, so "nobody opens every day" can't force a reserve nanny onto a key.
    const roster = solveValid(makeInput({ teachers: 4, nannies: 3, groups: 2, days: [D] }))
    for (const a of roster.assignments.filter((x) => x.opener || x.closer)) {
      expect(a.seat).toBeDefined()
    }
  })
})
```

- [ ] **Step 2:** Run `npx vitest run tests/core/model.test.ts`. Expected: at least one of the 3
  FAILS. If all 3 already pass by luck, keep them as guards: they still pin the rules.

- [ ] **Step 3: Nanny-seat holders.** In the strict-rules loop, record who can sit in each nanny
  seat. Before the loop, add:

```ts
  // Per day and group: the people who can take its nanny seat, with their seat variable (v3-b).
  const nannySeatVars = days.map(() => new Map<number, [number, string][]>())
  const nannySeatHolder = (d: number, g: number, p: number, name: string) => {
    const list = nannySeatVars[d].get(g) ?? []
    list.push([p, name])
    nannySeatVars[d].set(g, list)
  }
```

  Then change the two seat creations:
  - substitutes:
    `const name = seat(v.substitution(p, d, g), d, p, g); objectives.substitutions.add(name); nannySeatHolder(d, g, p, name)`
  - nannies:
    `nannySeatHolder(d, g, p, seat(v.nannySeat(p, d, g), d, p, g))`

- [ ] **Step 4: The three soft rules.** After the ügyelet block from Task 4, add:

```ts
  // ── Her v3-b soft rules ───────────────────────────────────────────────────
  for (const day of days) {
    const d = day.index

    // Groups 1–2, 3–4…: one nanny DE, the other DU. ns ≥ 1 when the seat's holder is on t.
    const onShift = (g: number, t: Shift) => {
      const name = milp.nonNegative(v.nannyShift(d, g, t))
      for (const [p, seatVar] of nannySeatVars[d].get(g) ?? []) {
        const both = new Lin().add(seatVar).add(v.shift(p, d, t)).addConstant(-1)
        milp.constrain(new Lin().add(name), '>=', both)
      }
      return name
    }
    for (let g = 1; g + 1 <= day.groups; g += 2) {
      const clash = milp.nonNegative(v.pairClash(d, g))
      objectives.pairs.add(clash)
      for (const t of SHIFTS) {
        const same = new Lin().add(onShift(g, t)).add(onShift(g + 1, t)).addConstant(-1)
        milp.constrain(new Lin().add(clash), '>=', same)
      }
    }

    // DE − DU per role, reserves included: a gap of 2 costs 1, 3 costs 4, 4 costs 7.
    for (const role of ['teacher', 'nanny'] as const) {
      const members = day.present.filter((p) => people[p].role === role)
      if (members.length < 2) continue
      const diff = new Lin()
      for (const p of members) diff.add(v.shift(p, d, 'morning')).add(v.shift(p, d, 'afternoon'), -1)
      for (const step of [1, 2] as const) {
        const over = milp.nonNegative(v.imbalance(d, role, step))
        objectives.balance.add(over, step)
        milp.constrain(new Lin().add(over), '>=', new Lin().plus(diff).addConstant(-step))
        milp.constrain(new Lin().add(over), '>=', new Lin().plus(diff, -1).addConstant(-step))
      }
    }

    // An opener or closer from reserve costs a little: a seated nanny should hold the key.
    for (const p of day.present.filter((q) => !isTeacher(q))) {
      for (const key of ['open', 'close'] as const) {
        const spare = milp.nonNegative(v.keyFromReserve(key, p, d))
        objectives.keysSeated.add(spare)
        const holds = key === 'open' ? v.open(p, d) : v.close(p, d)
        milp.constrain(new Lin().add(spare), '>=', new Lin().add(holds).plus(seats[d][p], -1))
      }
    }
  }
```

  (`onShift` is called once per group and shift, so no variable is declared twice.)

- [ ] **Step 5:** Run `npx vitest run tests/core/model.test.ts`. Expected: PASS. Then run
  `npm test` and handle fallout. Explain tests may now see different, better-split rosters.

- [ ] **Step 6: Commit**

```bash
git add src/core/model.ts tests/core
git commit -m "feat(solver): nanny pairs on opposite shifts, an even DE/DU day, keys from a seat"
```

---

### Task 6: Swaps and recalculation carry ügyelet

**Files:** Modify `src/core/edit.ts`, `src/core/recalc.ts`, `src/i18n/hu.ts` (`ui.recalc.day`).
Test: `tests/core/edit.test.ts`, `tests/core/recalc.test.ts`, `tests/i18n/recalcText.test.ts`.

- [ ] **Step 1: Failing tests.**
  - `tests/core/edit.test.ts`, inside `describe('swapDay', …)`. The file's `roster` has `t1`
    seated DE in group 1 and `t3` in reserve on `WED`:

```ts
  it('hands ügyelet to whoever takes the duty seat', () => {
    const withDuty: Roster = {
      ...roster,
      assignments: roster.assignments.map((a) =>
        a.seat?.kind === 'teacher' ? { ...a, duty: true } : a,
      ),
    }
    const swapped = swapDay(withDuty, staff, { date: WED, a: 't1', b: 't3' })
    expect(dayOf(swapped, 't3')?.duty).toBe(true)
    expect(dayOf(swapped, 't1')?.duty).toBeUndefined()
  })
```

  - `tests/core/recalc.test.ts`, inside `describe('scheduleChanges', …)`:

```ts
  it('counts a duty change as changed hours', () => {
    const after = oneDay(wall.assignments.map((a) => (a.staffId === 't1' ? { ...a, duty: undefined } : a)))
    const t1 = scheduleChanges(wall, after, WED).find((c) => c.staffId === 't1')
    expect(t1?.hours).toBe(true)
  })
```

  (`wall`'s `t1` carries `duty: true` since Task 4.)

  - `tests/i18n/recalcText.test.ts`: add a case following the file's existing pattern:

```ts
  it('names an ügyelet taken on, with its times', () => {
    const was: Assignment = { staffId: 't1', date: '2026-10-28', shift: 'morning', seat: { kind: 'teacher', group: 1, shift: 'morning' } }
    const now: Assignment = { ...was, duty: true }
    expect(ui.recalc.day('teacher', was, now, false)).toBe(
      'szerda: DE ügyelet 6:30–13:00 (eddig nem ügyeletes), 1. cs.',
    )
  })
```

- [ ] **Step 2:** Run
  `npx vitest run tests/core/edit.test.ts tests/core/recalc.test.ts tests/i18n/recalcText.test.ts`.
  Expected: the 3 new tests FAIL.

- [ ] **Step 3: Implement.**
  - `edit.ts` `takeOver`: after `if (from.closer) next.closer = true`, add
    `if (from.duty) next.duty = true // ügyelet belongs to the seat`. Then update the
    `swapDay` doc comment: *"shift, seat, opener, closer and ügyelet"*.
  - `recalc.ts`:
    - Import `groupNumbers` from `./model`, and destructure `duty` from `model` in
      `anchorModel`.
    - In the day loop, right after `const d = day.index`:

```ts
    if (day.date < anchor.from && day.groups > 0) {
      // The anchor's ügyelet group that day; none (a pre-v3-b roster, or a duty hole) pins the hole.
      const dutyGroup = anchor.roster.assignments.find((a) => a.date === day.date && a.duty)
        ?.seat?.group
      for (const g of groupNumbers(day.groups)) {
        milp.constrain(new Lin().add(v.dutyGroup(d, g)), '=', g === dutyGroup ? 1 : 0)
      }
    }
```

    - After the `hours >= differs(v.shift…)` constraint:

```ts
      // Ügyelet moves the hours by 30 minutes: a change is a phone call too.
      if (!duty[d][p].isEmpty()) {
        const dutyDiffers = a.duty ? Lin.constant(1).plus(duty[d][p], -1) : new Lin().plus(duty[d][p])
        milp.constrain(new Lin().add(hours), '>=', dutyDiffers)
      }
```

    - `sameDay`: add `!a.duty === !b.duty &&`.
    - `scheduleChanges`: `hours: then.shift !== now.shift || !then.duty !== !now.duty`.
    - Update the `ScheduleChange.hours` comment: *"the shift or the ügyelet changed, not just
      the seat or the key"*.
  - `hu.ts` `ui.recalc.day`: replace the `if (now.shift !== was.shift) { … } else if` head with:

```ts
      if (now.shift !== was.shift || !now.duty !== !was.duty) {
        const times = shiftTimes(role, now.shift, now.date, now.duty)
        const shift = `${shiftShort[now.shift]}${now.duty ? ' ügyelet' : ''}`
        const before =
          now.shift !== was.shift
            ? `eddig ${shiftShort[was.shift]}${was.duty ? ' ügyelet' : ''}`
            : was.duty
              ? 'eddig ügyeletes'
              : 'eddig nem ügyeletes'
        parts.push(`${shift} ${times} (${before})`, place(now))
      } else if (place(now) !== place(was)) {
```

- [ ] **Step 4:** Run the three files again. Expected: PASS. Then run `npm test`.

- [ ] **Step 5: Commit**

```bash
git add src/core/edit.ts src/core/recalc.ts src/i18n/hu.ts tests
git commit -m "feat(recalc): ügyelet follows the seat in a swap, stays pinned in the past, and counts as an hours change"
```

---

### Task 7: Warnings

**Files:** Modify `src/core/metrics.ts`, `src/core/explain.ts`, `src/i18n/hu.ts`. Test:
`tests/core/switches.test.ts` (it holds the metrics tests), `tests/core/explain.test.ts`.

- [ ] **Step 1: Failing tests.** Append to `tests/core/explain.test.ts`, using its existing
  imports and adding these to them: `explain` (already imported) and `makeInput`, `TEST_META`
  from `./fixtures`.

```ts
describe('v3-b warnings', () => {
  const D = '2026-10-26'
  const input = makeInput({ teachers: 4, nannies: 4, groups: 2, days: [D] })
  const at = (staffId: string, shift: 'morning' | 'afternoon', rest: Partial<Assignment> = {}): Assignment => ({ staffId, date: D, shift, ...rest })
  const roster = (assignments: Assignment[], holes: Roster['holes'] = []): Roster => ({
    period: input.period, groupsPerDay: { [D]: 2 }, assignments, holes, warnings: [], ...TEST_META,
  })
  const teachers = [
    at('t1', 'morning', { seat: { kind: 'teacher', group: 1, shift: 'morning' }, duty: true }),
    at('t2', 'afternoon', { seat: { kind: 'teacher', group: 1, shift: 'afternoon' }, duty: true }),
    at('t3', 'morning', { seat: { kind: 'teacher', group: 2, shift: 'morning' } }),
    at('t4', 'afternoon', { seat: { kind: 'teacher', group: 2, shift: 'afternoon' } }),
  ]
  const codes = (r: Roster) => explain(input, r).map((w) => w.code)

  it('flags a pair whose nannies share a shift, and a lopsided day', () => {
    const r = roster([
      ...teachers,
      at('n1', 'morning', { seat: { kind: 'nanny', group: 1 }, opener: true }),
      at('n2', 'morning', { seat: { kind: 'nanny', group: 2 } }),
      at('n3', 'morning'),
      at('n4', 'afternoon', { closer: true }),
    ])
    const warnings = explain(input, r)
    expect(warnings.find((w) => w.code === 'PAIR_SAME')?.text).toBe('Hétfő, 1–2. cs.: mindkét dajka DE.')
    const lopsided = warnings.find((w) => w.code === 'SHIFT_IMBALANCE')
    expect(lopsided?.text).toBe('Hétfő: dajkák 3 DE / 1 DU.')
    expect(lopsided?.severity).toBe('grey')
  })

  it('stays quiet on a split pair and an even day', () => {
    const r = roster([
      ...teachers,
      at('n1', 'morning', { seat: { kind: 'nanny', group: 1 }, opener: true }),
      at('n2', 'afternoon', { seat: { kind: 'nanny', group: 2 }, closer: true }),
      at('n3', 'morning'),
      at('n4', 'afternoon'),
    ])
    expect(codes(r)).not.toContain('PAIR_SAME')
    expect(codes(r)).not.toContain('SHIFT_IMBALANCE')
  })

  it('reports a missing ügyelet in red', () => {
    const r = roster(teachers.map((a) => ({ ...a, duty: undefined })), [{ kind: 'duty', date: D }])
    const missing = explain(input, r).find((w) => w.code === 'DUTY_MISSING')
    expect(missing?.severity).toBe('red')
    expect(missing?.text).toBe('Hétfőn nincs ügyeletes csoport: egy csoportban sincs meg mindkét óvónő.')
  })
})
```

  Check the day-name helpers before trusting the expected strings: `dayName('2026-10-26')`
  should be `hétfő` and `onDay` `hétfőn`, so the capitalised forms are *Hétfő* / *Hétfőn*. If
  `tests/core/explain.test.ts` builds rosters differently, copy its pattern. The texts above
  stay the contract.

- [ ] **Step 2:** Run `npx vitest run tests/core/explain.test.ts`. Expected: FAIL.

- [ ] **Step 3: Metrics.** Append to `src/core/metrics.ts` (add `Role`, `Shift` to the type
  import):

```ts
export type PairClash = { date: string; group: number; shift: Shift }
export type ShiftImbalance = { date: string; role: Role; morning: number; afternoon: number }

/** Groups 1–2, 3–4…: both nannies on the same shift (v3-b). */
export function pairClashes(input: SolveInput, roster: Roster): PairClash[] {
  const out: PairClash[] = []
  for (const date of openDays(input, roster)) {
    const nannyOf = (g: number) =>
      roster.assignments.find((a) => a.date === date && a.seat?.kind === 'nanny' && a.seat.group === g)
    for (let g = 1; g + 1 <= (roster.groupsPerDay[date] ?? 0); g += 2) {
      const first = nannyOf(g)
      const second = nannyOf(g + 1)
      if (first && second && first.shift === second.shift) out.push({ date, group: g, shift: first.shift })
    }
  }
  return out
}

/** A day whose teachers, or nannies, reserves included, split 2 or more apart between DE and DU (v3-b). */
export function shiftImbalances(input: SolveInput, roster: Roster): ShiftImbalance[] {
  const roleOf = new Map(input.staff.map((s) => [s.id, s.role]))
  const out: ShiftImbalance[] = []
  for (const date of openDays(input, roster)) {
    for (const role of ['teacher', 'nanny'] as const) {
      const today = roster.assignments.filter((a) => a.date === date && roleOf.get(a.staffId) === role)
      const morning = today.filter((a) => a.shift === 'morning').length
      const afternoon = today.length - morning
      if (Math.abs(morning - afternoon) >= 2) out.push({ date, role, morning, afternoon })
    }
  }
  return out
}
```

- [ ] **Step 4: Texts.** In `hu.ts` `warningText`, add:

```ts
  dutyMissing: (date: string) =>
    `${capitalize(onDay(date))} nincs ügyeletes csoport: egy csoportban sincs meg mindkét óvónő.`,
  dutyAction: 'Hívj be egy óvónőt, vagy vond össze a csoportokat.',
  pairSame: (date: string, group: number, shift: Shift) =>
    `${capitalize(dayName(date))}, ${group}–${group + 1}. cs.: mindkét dajka ${shiftShort[shift]}.`,
  shiftImbalance: (date: string, role: Role, morning: number, afternoon: number) =>
    `${capitalize(dayName(date))}: ${role === 'teacher' ? 'óvónők' : 'dajkák'} ${morning} DE / ${afternoon} DU.`,
```

  In `uneven`'s `what` record add `duty: \`${detail.count} napon ügyeletes\``. In `yearNoun`
  add `duty: 'ügyelettel'`. In `UnevenDetail`, the second member's kind becomes
  `'opener' | 'closer' | 'reserve' | 'duty'`.

- [ ] **Step 5: Explain.** In `explain.ts`:
  - Import `pairClashes, shiftImbalances` from `./metrics`.
  - In the holes loop, before the key branch:
    `if (hole.kind === 'duty') { add('DUTY_MISSING', hole.date, t.dutyMissing(hole.date), { action: t.dutyAction }); continue }`.
    The key branch can then return to a plain `} else {`.
  - After the turnarounds loop:

```ts
  for (const c of pairClashes(input, roster)) {
    add('PAIR_SAME', c.date, t.pairSame(c.date, c.group, c.shift), {
      cells: [{ date: c.date, group: c.group }, { date: c.date, group: c.group + 1 }],
    })
  }

  for (const s of shiftImbalances(input, roster)) {
    const gap = Math.abs(s.morning - s.afternoon)
    add('SHIFT_IMBALANCE', s.date, t.shiftImbalance(s.date, s.role, s.morning, s.afternoon), {
      severity: gap >= 3 ? 'orange' : 'grey',
    })
  }
```

  - In the fairness loop, first line:
    `if (share.kind === 'opener' || share.kind === 'closer') continue // demoted in v3-b: not worth a warning`.

- [ ] **Step 6:** Run `npx vitest run tests/core/explain.test.ts`. Expected: PASS. Run
  `npm test` and handle fallout. Earlier explain tests expecting `UNEVEN` for keys lose those
  entries, which is intended.

- [ ] **Step 7: Commit**

```bash
git add src/core/metrics.ts src/core/explain.ts src/i18n/hu.ts tests
git commit -m "feat(warnings): missing ügyelet, a pair on one shift, a lopsided day; no key-split warnings"
```

---

### Task 8: Views, print, Excel, legend, year balance

**Files:** Modify `src/export/views.ts`, `src/i18n/hu.ts`, `src/state/history.ts`,
`src/ui/YearBalance.tsx`. Test: `tests/export/views.test.ts`, `tests/state/history.test.ts`.

- [ ] **Step 1: Failing tests.**
  - `tests/export/views.test.ts`: append (it has `MON`, `staff`, `TEST_META`):

```ts
describe('ügyelet (v3-b)', () => {
  const dutyDay: Roster = {
    period: { start: MON, days: [MON] },
    groupsPerDay: { [MON]: 1 },
    assignments: [
      { staffId: 't1', date: MON, shift: 'morning', seat: { kind: 'teacher', group: 1, shift: 'morning' }, duty: true },
      { staffId: 't2', date: MON, shift: 'afternoon', seat: { kind: 'teacher', group: 1, shift: 'afternoon' }, duty: true },
      { staffId: 'n1', date: MON, shift: 'morning', seat: { kind: 'nanny', group: 1 }, opener: true },
      { staffId: 'n2', date: MON, shift: 'afternoon', closer: true },
    ],
    holes: [],
    warnings: [],
    ...TEST_META,
  }

  it('heads the duty group with Ügyelet and shows the shifted start and end', () => {
    const cell = groupView(dutyDay, staff).rows[0].cells[0]
    expect(cell[0]).toEqual({ text: 'Ügyelet', bold: true })
    expect(cell[1].text).toBe('DE: T1 6:30-tól')
    expect(cell[2].text).toBe('DU: T2 17:30-ig')
  })

  it('marks the day in the person view', () => {
    const t1 = personView(dutyDay, staff, []).rows.find((r) => r.staffId === 't1')!
    expect(t1.cells[0].text).toBe('DE · 1. cs. · ügyelet')
  })
})
```

  - `tests/state/history.test.ts`: in a `yearTotals` case with a saved roster, give one
    assignment `duty: true` and expect `counts.duty` to be `1` for that person.

- [ ] **Step 2:** Run both files. Expected: FAIL.

- [ ] **Step 3: Implement.**
  - `hu.ts`, next to `shiftShort`:

```ts
/** Ügyelet in the group view: the teacher's shifted start, or end (v3-b). */
export const DUTY = 'Ügyelet'
export const dutyMark: Record<Shift, string> = { morning: ' 6:30-tól', afternoon: ' 17:30-ig' }
```

  - `LEGEND`: add after the teacher line:
    `'Ügyelet: a csoport óvónői DE 6:30-tól, DU 17:30-ig dolgoznak, ugyanannyi órában.'`
  - `views.ts` `groupView`: import `DUTY, dutyMark`. Give the teacher line text
    `` `${shiftShort[shift]}: ${name(a.staffId)}${a.duty ? dutyMark[shift] : ''}` ``. After
    building `lines`, before the nanny line:
    `if (today.some((x) => x.duty && x.seat?.kind === 'teacher' && x.seat.group === g)) lines.unshift({ text: DUTY, bold: true })`.
  - `views.ts` `personView`: give the text
    `` `${shiftShort[a.shift]} · ${where}${extra}${a.duty ? ' · ügyelet' : ''}` ``.
  - `history.ts` `yearTotals`: after `if (!a.seat) counts.reserve++` add
    `if (a.duty) counts.duty++`. Update the doc comment: *"…reserve days and ügyelet days…"*.
  - `hu.ts` `ui.staff.yearColumns`: append `'Ügyelet'`. In `yearBalanceEmpty`, change
    *"nyitó, záró vagy tartalék"* to *"nyitó, záró, tartalék vagy ügyeletes"*.
  - `YearBalance.tsx`: after the reserve cell add
    `<td>{`${counts.duty}${signed(deltas.duty)}`}</td>`.

- [ ] **Step 4:** Run both files, then `npm test`. `tests/ui/YearBalance.test.tsx` may list the
  columns, so update it to include *Ügyelet*. Commit:

```bash
git add src/export/views.ts src/i18n/hu.ts src/state/history.ts src/ui/YearBalance.tsx tests
git commit -m "feat(views): ügyelet on the wall, the printout, Excel and the year balance"
```

---

### Task 9: Time limits double

**Files:** Modify `src/core/solve.ts`, `src/worker/client.ts`, `src/i18n/hu.ts`.

- [ ] **Step 1: Implement.**
  - `solve.ts`: set `STAGE_TIME_LIMIT = 30` with the comment *"Seconds per stage. She is fine
    waiting a minute or more (2026-10-17), and her laptop is slow, so this is generous: a
    realistic week needs a few seconds in all."* Keep the existing sentences about running out.
    Set `YEARLY_TIME_LIMIT = 20`.
  - `client.ts`: `export const SOLVE_TIMEOUT_MS = 480_000`, with the comment *"Every solver
    stage stops itself (STAGE_TIME_LIMIT); this outlasts all fourteen of them and only catches a
    hang."*
  - `hu.ts`: `solving: 'Számolok… ez akár egy-két percig is eltarthat.'`

- [ ] **Step 2:** Run `npm test`. The guard in `tests/worker/client.test.ts`
  (`SOLVE_TIMEOUT_MS > STAGES.length × STAGE_TIME_LIMIT`, i.e. 480 s > 420 s) must pass. Any UI
  test matching the old *solving* text gets the new one.

- [ ] **Step 3: Commit**

```bash
git add src/core/solve.ts src/worker/client.ts src/i18n/hu.ts tests
git commit -m "feat(solver): time limits double — correctness over speed on her slow laptop"
```

---

### Task 10: Her real weeks, docs, verification, PR

**Files:** Create `scripts/time-weeks.ts`. Modify `README.md`, `docs/spec.md`.

- [ ] **Step 1: Timing script.** Create `scripts/time-weeks.ts`:

```ts
import { readFile } from 'node:fs/promises'
import loadHighs from 'highs'
import { solve, type LpSolver } from '../src/core/solve'
import { validateRoster } from '../src/core/validate'
import { migrate } from '../src/state/migrate'
import { solveInputFor } from '../src/state/solveInput'

// npx tsx scripts/time-weeks.ts data/ovoda-mentes-2026-10-17.json
// Solves every week with a saved roster in a backup: seconds per solver stage, and any break.
const state = migrate(JSON.parse(await readFile(process.argv[2], 'utf8')))
const highs = await loadHighs()
for (const week of Object.keys(state.periods).sort()) {
  if (!state.periods[week].roster) continue
  const input = solveInputFor(state, week)
  const seconds: string[] = []
  const timed: LpSolver = {
    solve: (lp, options) => {
      const started = performance.now()
      const result = highs.solve(lp, options)
      seconds.push(((performance.now() - started) / 1000).toFixed(1))
      return result
    },
  }
  const roster = solve(input, timed, { solvedAt: new Date().toISOString(), appVersion: 'time' })
  const broken = validateRoster(input, roster).map((v) => v.rule)
  console.log(week, seconds.join(' '), roster.stoppedEarly ?? '', broken.join(',') || 'valid')
}
```

- [ ] **Step 2: Run it on her backups.**

```bash
npx tsx scripts/time-weeks.ts data/ovoda-mentes-2026-10-17.json
npx tsx scripts/time-weeks.ts data/ovoda-mentes-2026-09-27.json
time npm run slice
```

  Expected for every week: `valid`, and no `stoppedEarly`. Note the slowest stage. If a stage
  hits 30 s on an ordinary week, stop and report: that's a model problem, not a limit to raise.

- [ ] **Step 3: The golden week.** Run `npx vitest run tests/scripts/golden.test.ts`. It fails
  now (new rules, new roster). Open `data/beosztas-2026-08-24.xlsx`, as rewritten by
  `npm run slice`, and check her week:
  - one ügyelet group a day
  - pairs split
  - keys from seated nannies

  Then update the snapshot: `npx vitest run tests/scripts/golden.test.ts -u`. (`data/` is
  gitignored, so nothing gets committed.)

- [ ] **Step 4: Docs.**
  - `docs/spec.md` §2, *Her rules*: replace *"No personal requests, no pairing rules, no
    ügyelet."* with *"No personal requests. Ügyelet, nanny pairs and the daily DE/DU balance
    arrived in v3-b (`docs/specs/2026-10-17-v3-b-duty-and-shift-balance-design.md`), which also
    reorders §6.5's stages."*
  - Add a matching one-line pointer at the top of §6.5.
  - `README.md` *How it works*: list the stage order from the v3-b spec, and the ügyelet,
    pairs and balance rules in one bullet each, in the README's voice.

- [ ] **Step 5: Verify everything**

```bash
npx prettier --write src tests scripts README.md docs
npm test && npm run typecheck && npm run format:check && npm run build
PROPERTY_RUNS=100 npx vitest run tests/core/properties.test.ts tests/core/edit.test.ts
```

  Expected: all green.

- [ ] **Step 6: Commit and PR**

```bash
git add scripts/time-weeks.ts README.md docs
git commit -m "docs: v3-b rules in the README and spec; a timing script for her backups"
```

  Push, open a PR, and merge when CI is green.
