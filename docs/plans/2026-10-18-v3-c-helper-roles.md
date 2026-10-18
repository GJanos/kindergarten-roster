# v3-c — helper roles: pedagógiai asszisztens and civil — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Two new staff roles. An asszisztens sits beside a group's DE teacher on 8–16 and stands
in for a missing DU teacher on 10–18. A civil floats on 8–16 and stands in for a missing nanny,
before any teacher does. Neither counts in fairness.

**Architecture:**
- `Role` gains `'assistant' | 'civil'` and `Shift` gains `'day'`. A new `SeatShift` keeps teacher
  seats on DE/DU.
- The roster carries a `{ kind: 'helper' }` seat. Stand-ins reuse the teacher and nanny seats
  with `substitution`.
- The model:
  - per-helper shift variables, with 8–16 forced unless the helper stands in
  - helper seats
  - stand-in seats, gated by the headcount
  - one new integral stage, `helpers`
- `capacity.ts` holds the headcount formulas (`civilStandIns`, `seatedTeachers`,
  `assistantStandIns`), so the model, fairness, warnings and the quick-fix preview count alike.
- A by-hand shift change (`editShift`) goes through the same gate as a swap.

**Tech Stack:** TypeScript, HiGHS (MILP via `highs` WASM), React 19, Vitest.

Spec: `docs/specs/2026-10-17-v3-c-helper-roles-design.md`. Run from `Projects/kindergarten-roster`,
on branch `v3-c-helpers` off `main` (`git switch -c v3-c-helpers`). Commit this plan there first:
`git add docs/plans/2026-10-18-v3-c-helper-roles.md && git commit -m "docs(plans): v3-c helper roles"`.
Tests mirror `src/` under `tests/`. **After every task run `npm run typecheck` and the whole suite
(`npm test`), not just the new test.** Task 1 is the one exception, noted there.

A model change can move solver output, so a test asserting an exact roster can shift. For each
such failure:
1. Read the new roster.
2. Update the expectation **only if** it still follows her rules.
3. Note it in the commit message.

A failure that breaks a strict rule is a bug to fix, never an expectation to update.

## Decisions taken here (confirm with her; each is one place to change)

1. **Asszisztens gate:** the spec says *"the day's teachers fewer than 2 × groups"*. This plan
   counts the teachers left for teacher seats after any teacher stands in as a nanny
   (`seatedTeachers < 2 × groups`), which is her *"only when a teacher is missing"*.
2. **Ügyelet fairness:** a day where an asszisztens may stand in is left out of the teachers'
   ügyelet pool, the way 1-group days already are. Otherwise the pool would assume two teacher
   duty seats on a day that might have one.
3. **A by-hand shift keeps the seat:** Bea beside group 2, moved to 6–14, stays beside group 2.
4. **Civils and keys:** a civil holds a key only while standing in as a nanny (spec). *Nobody
   opens, or closes, every day* covers them too.
5. **Group view:** asszisztens extras and civils go on one extra row, *"Asszisztens, civil"*,
   under the reserve rows. It shows only in a week that has a helper. An asszisztens on DU
   ügyelet gets no *"17:30-ig"* mark, since her hours don't move.
6. **Teachers as nanny stand-ins** keep today's gate (nannies < groups). The weights, 1 vs 3,
   put civils first.
7. **The kept past of a recalculation** gets every stand-in seat, ungated, and no 8–16 rule. A
   past by-hand edit stays as worked. This also fixes a latent crash after a by-hand swap.
8. **Munkatársak:** a *Munkakör* dropdown replaces the *→ Dajka / → Óvónő* button.
9. **Demo data** gains one asszisztens and one civil.

## Files

| File | Change |
| --- | --- |
| `src/core/types.ts` | `Role` +2, `ROLES`, `isHelper`, `SeatShift`, `Shift` +`'day'`, `HELPER_SHIFTS`, helper seat |
| `src/core/shifts.ts` | helper times |
| `src/core/capacity.ts` | assistants and civils counted; stand-in formulas; `cover` |
| `src/core/fairness.ts` | helpers out; reserve and ügyelet pools by the new formulas |
| `src/core/validate.ts` | helper rules |
| `src/core/model.ts` | helper shifts, helper seats, stand-ins, keys, `helpers` stage, `keepBefore` |
| `src/core/solve.ts` | decode helper seats and stand-ins; `keepBefore` |
| `src/core/recalc.ts` | pin helper seats, civils' keys, a missing shift |
| `src/core/edit.ts` | substitution by seat; `setShift`, `editShift` |
| `src/core/explain.ts` | helper stand-in texts; new `groupsWithoutTeacherHoles` |
| `src/core/names.ts` | `rosterOrder` in `ROLES` order |
| `src/i18n/hu.ts` | shift and role tables, warning texts, refusal reasons, legend |
| `src/export/views.ts`, `src/export/xlsx.ts`, `src/app/print.css` | helper lines and row, NAP fill |
| `src/state/history.ts`, `src/state/migrate.ts` | helpers out of the year; new roles load |
| `src/ui/StaffScreen.tsx`, `AbsenceGrid.tsx`, `DayChips.tsx`, `warningDays.ts`, `highlight.ts`, `RosterScreen.tsx` | four sections, coverage, call-ins, shift buttons |
| `src/demo/demoData.ts` | one asszisztens, one civil |
| `tests/core/fixtures.ts` | helpers in `makeStaff` / `makeInput`; `randomHelperInput` |
| `README.md`, `docs/spec.md` | the roles |

---

### Task 1: Roles, the day shift, and their tables

**Files:** Modify `src/core/types.ts`, `src/core/shifts.ts`, `src/core/names.ts`,
`src/i18n/hu.ts`, `src/export/views.ts`, `src/export/xlsx.ts`, `src/app/print.css`,
`src/state/history.ts`, `src/state/migrate.ts`, `src/ui/StaffScreen.tsx`,
`src/ui/AbsenceGrid.tsx`, `tests/core/fixtures.ts`. Tests: `tests/core/shifts.test.ts`,
`tests/core/names.test.ts`, `tests/state/history.test.ts`, `tests/state/migrate.test.ts`.

- [ ] **Step 1: Failing tests.**

  Append inside the `describe` of `tests/core/shifts.test.ts`:

```ts
  it('gives helpers 8–16, or 6–14 / 10–18 when they stand in, Fridays too (v3-c)', () => {
    expect(shiftTimes('assistant', 'day', '2026-10-29')).toBe('8:00–16:00')
    expect(shiftTimes('civil', 'morning', '2026-10-30')).toBe('6:00–14:00')
    // A DU ügyelet already fits in 10–18: her hours don't move.
    expect(shiftTimes('assistant', 'afternoon', '2026-10-30', true)).toBe('10:00–18:00')
  })

  it('has no day shift for teachers and nannies', () => {
    expect(() => shiftTimes('teacher', 'day', '2026-10-29')).toThrow(/No day shift/)
  })
```

  Append to `tests/core/names.test.ts` (add `rosterOrder` and `makeStaff` imports):

```ts
describe('rosterOrder', () => {
  it('lists teachers, nannies, asszisztens, then civils, each by name', () => {
    const staff = makeStaff(1, 1, 1, 1).reverse()
    expect(rosterOrder(staff).map((s) => s.id)).toEqual(['t1', 'n1', 'a1', 'c1'])
  })
})
```

  Append inside `describe('yearTotals', …)` of `tests/state/history.test.ts`:

```ts
  it('leaves helpers out: no row, no counts (v3-c)', () => {
    const monday = '2026-10-26'
    const period = saved(monday, {})
    period.roster.assignments = [
      { staffId: 'a1', date: monday, shift: 'day', seat: { kind: 'helper', group: 1 } },
      { staffId: 'c1', date: monday, shift: 'day' },
    ]
    const state: AppState = {
      ...emptyState(),
      staff: makeStaff(1, 0, 1, 1),
      periods: { [monday]: period },
    }
    expect(yearTotals(state, '2026-11-05').map((row) => row.staffId)).toEqual(['t1'])
  })
```

  Append inside `describe('migrate', …)` of `tests/state/migrate.test.ts`:

```ts
  it('accepts the helper roles, and nothing else (v3-c)', () => {
    const person = (role: string) => ({ id: role, fullName: 'X', displayName: 'X', role, active: true })
    const state = { ...emptyState(), staff: [person('assistant'), person('civil')] }
    expect(migrate(structuredClone(state))).toEqual(state)
    expect(() => migrate({ ...emptyState(), staff: [person('cook')] })).toThrow(InvalidDataError)
  })
```

- [ ] **Step 2:** Run `npx vitest run tests/core/shifts.test.ts tests/core/names.test.ts
  tests/state/history.test.ts tests/state/migrate.test.ts`. Expected: FAIL. `makeStaff` takes
  two arguments, `shiftTimes` returns nanny/teacher times, and `migrate` rejects the roles.

- [ ] **Step 3: Fixtures.** In `tests/core/fixtures.ts`, replace `makeStaff` and extend
  `InputSpec` / `makeInput`:

```ts
/** Teachers t1…tN, nannies n1…nM, asszisztens a1…, civils c1…, all active; names are the ids in capitals. */
export function makeStaff(teachers: number, nannies: number, assistants = 0, civils = 0): Staff[] {
  const person = (id: string, role: Staff['role']): Staff => ({
    id,
    fullName: id.toUpperCase(),
    displayName: id.toUpperCase(),
    role,
    active: true,
  })
  const some = (count: number, prefix: string, role: Staff['role']) =>
    Array.from({ length: count }, (_, i) => person(`${prefix}${i + 1}`, role))
  return [
    ...some(teachers, 't', 'teacher'),
    ...some(nannies, 'n', 'nanny'),
    ...some(assistants, 'a', 'assistant'),
    ...some(civils, 'c', 'civil'),
  ]
}
```

  In `InputSpec` add, after `nannies: number`:

```ts
  assistants?: number // pedagógiai asszisztens (v3-c)
  civils?: number
```

  In `makeInput`, replace `staff: makeStaff(spec.teachers, spec.nannies),` with
  `staff: makeStaff(spec.teachers, spec.nannies, spec.assistants, spec.civils),`.

- [ ] **Step 4: Types.** In `src/core/types.ts`, replace the first three lines with:

```ts
/** Óvónő, dajka; pedagógiai asszisztens and civil since v3-c. Her order: lists, sections, rows. */
export type Role = 'teacher' | 'nanny' | 'assistant' | 'civil'
export const ROLES: readonly Role[] = ['teacher', 'nanny', 'assistant', 'civil']

/** The helpers (v3-c): outside every fairness count, the year balance and the DE/DU balance. */
export function isHelper(role: Role): boolean {
  return role === 'assistant' || role === 'civil'
}

/** A seat's shift: DE or DU. */
export type SeatShift = 'morning' | 'afternoon'
/** 'day' is a helper's 8:00–16:00 (v3-c); teachers and nannies work DE or DU only. */
export type Shift = SeatShift | 'day'
export const SHIFTS: readonly SeatShift[] = ['morning', 'afternoon']
export const HELPER_SHIFTS: readonly Shift[] = ['day', 'morning', 'afternoon']
```

  Replace the `Seat` type:

```ts
/** Groups are numbered from 1, as on the wall. A helper seat is an asszisztens beside the DE teacher (v3-c). */
export type Seat =
  | { kind: 'teacher'; group: number; shift: SeatShift }
  | { kind: 'nanny'; group: number }
  | { kind: 'helper'; group: number }
```

  In `Assignment`, change the `substitution` comment to
  `// in another role's seat: a teacher or civil as nanny, an asszisztens as DU teacher (v3-c)`.
  In `Hole`, change the teacher seat's `shift: Shift` to `shift: SeatShift`.

- [ ] **Step 5: Times.** Replace `src/core/shifts.ts`:

```ts
import { usesFridayTimes } from './calendar'
import { isHelper, type Role, type Shift } from './types'

/** A helper's hours (v3-c): the same every day. */
const HELPER_TIMES: Record<Shift, string> = {
  day: '8:00–16:00',
  morning: '6:00–14:00',
  afternoon: '10:00–18:00',
}

/**
 * Fixed shift times (spec §2): never optimised, never stretched. Ügyelet (v3-b) moves a teacher's
 * shift 30 minutes — the morning one earlier, the afternoon one later — at the same length. A
 * helper's 10–18 already covers a DU ügyelet, so her hours never move (v3-c).
 */
export function shiftTimes(role: Role, shift: Shift, date: string, duty = false): string {
  if (isHelper(role)) return HELPER_TIMES[shift]
  if (shift === 'day') throw new Error(`No day shift for a ${role}`)
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

- [ ] **Step 6: Order.** In `src/core/names.ts`, import `ROLES` and replace `rosterOrder`:

```ts
/** Teachers, nannies, asszisztens, then civils (v3-c), each by name. */
export function rosterOrder(staff: Staff[]): Staff[] {
  return [...staff].sort(
    (a, b) =>
      ROLES.indexOf(a.role) - ROLES.indexOf(b.role) ||
      (a.displayName || a.fullName).localeCompare(b.displayName || b.fullName, 'hu'),
  )
}
```

- [ ] **Step 7: Hungarian tables.** In `src/i18n/hu.ts`:
  - import `SeatShift` beside `Shift`
  - replace `shiftShort` and `dutyMark`:

```ts
export const shiftShort: Record<Shift, string> = { morning: 'DE', afternoon: 'DU', day: 'NAP' }
/** A helper's hours, short (v3-c): 'Asszisztens: Bea (8–16)'. */
export const helperShort: Record<Shift, string> = {
  day: '8–16',
  morning: '6–14',
  afternoon: '10–18',
}

/** Ügyelet in the group view: the teacher's shifted start, or end (v3-b). */
export const DUTY = 'Ügyelet'
export const dutyMark: Record<SeatShift, string> = {
  morning: ' 6:30-tól',
  afternoon: ' 17:30-ig',
}
```

  - In `ui.staff`, add after `nannies: 'Dajkák',`:

```ts
    roles: {
      teacher: 'Óvónő',
      nanny: 'Dajka',
      assistant: 'Pedagógiai asszisztens',
      civil: 'Civil',
    } satisfies Record<Role, string>,
    sections: {
      teacher: 'Óvónők',
      nanny: 'Dajkák',
      assistant: 'Pedagógiai asszisztensek',
      civil: 'Civilek',
    } satisfies Record<Role, string>,
```

  - Replace `add: { teacher: '+ Új óvónő', nanny: '+ Új dajka' },` with:

```ts
    add: {
      teacher: '+ Új óvónő',
      nanny: '+ Új dajka',
      assistant: '+ Új asszisztens',
      civil: '+ Új civil',
    } satisfies Record<Role, string>,
```

  - Replace the `away` line in `ui.absences`:

```ts
    away: {
      teacher: 'Távol (óvónő)',
      nanny: 'Távol (dajka)',
      assistant: 'Távol (asszisztens)',
      civil: 'Távol (civil)',
    } satisfies Record<Role, string>,
```

  - Change `const shiftAdjective: Record<Shift, string>` to `Record<SeatShift, string>`, and
    `teacherSeatEmpty`'s `shift: Shift` to `shift: SeatShift`.

- [ ] **Step 8: The NAP fill.** In `src/export/views.ts`, import `Shift` and set
  `export type Fill = Shift | 'absent' | 'closed'`. In `src/export/xlsx.ts`, add
  `day: 'FFE2F0D9',` to `FILLS` after `afternoon`. In `src/app/print.css`, after
  `.fill-afternoon { … }`, add:

```css
  .fill-day {
    background: #e2f0d9;
  }
```

- [ ] **Step 9: The year leaves helpers out.** In `src/state/history.ts`:
  - import `isHelper` and `SeatShift`
  - set `export type YearCounts = Record<SeatShift | Exclude<GapKind, 'morning'>, number>`
  - in `yearTotals`, first line of the body: `const helpers = new Set(state.staff.filter((s) => isHelper(s.role)).map((s) => s.id))`
  - first line inside `for (const a of period.roster.assignments) {`:

```ts
      if (helpers.has(a.staffId) || a.shift === 'day') continue // outside the balance (v3-c)
```

  - the final filter becomes
    `.filter((s) => !s.deleted && !isHelper(s.role) && (s.active || rows.has(s.id)))`
  - update the doc comment: *"Teachers first; helpers have no row (v3-c)."*

- [ ] **Step 10: Migrate.** In `src/state/migrate.ts`, import `ROLES`, add
  `const ROLE_NAMES: readonly unknown[] = ROLES` beside `KINDS`. In `isStaff`, replace the role
  check with `ROLE_NAMES.includes(value.role) &&`.

- [ ] **Step 11: Section titles by role.** In `src/ui/StaffScreen.tsx`, replace
  `const title = role === 'teacher' ? ui.staff.teachers : ui.staff.nannies` with
  `const title = ui.staff.sections[role]`. In `src/ui/AbsenceGrid.tsx`, replace
  `{s.role === 'teacher' ? ui.staff.teachers : ui.staff.nannies}` with
  `{ui.staff.sections[s.role]}`. Task 2 adds the helpers' columns and coverage.

- [ ] **Step 12: Run.** Run `npm test`. Expected: all pass.

  Run `npm run typecheck`. Expected: exactly one error, in `src/ui/warningDays.ts`: `helps`
  lacks `assistant` and `civil`. Task 2 adds them. Anything else is a site this step missed:
  fix it the way the tables above do.

- [ ] **Step 13: Commit.**

```bash
git add -A src tests
git commit -m "feat(core): asszisztens and civil roles, the 8–16 day shift, per-role tables"
```

---

### Task 2: The headcount counts helpers

**Files:** Modify `src/core/capacity.ts`, `src/core/explain.ts`, `src/ui/warningDays.ts`,
`src/ui/DayChips.tsx`, `src/ui/AbsenceGrid.tsx`, `src/i18n/hu.ts`. Tests:
`tests/core/capacity.test.ts`, `tests/ui/warningDays.test.ts`.

- [ ] **Step 1: Failing tests.** In `tests/core/capacity.test.ts`:
  - add `cover` to the imports
  - replace the body of `'suggests the largest group count with every teacher seat filled'`:

```ts
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
```

  - append:

```ts
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
  const day = (spec: { teachers: number; nannies: number; groups: number } & Partial<
    Record<'assistants' | 'civils', number>
  >) => dayCapacities(makeInput({ ...spec, days: [D] }))[0]

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
```

  Append inside `describe('warningDays', …)` of `tests/ui/warningDays.test.ts`:

```ts
  it('offers an absent asszisztens for an empty teacher seat (v3-c)', () => {
    const away = makeInput({
      teachers: 4,
      nannies: 3,
      assistants: 1,
      groups: 2,
      absent: { t4: [MON], a1: [MON] },
    })
    const { days } = warningDays(
      [seat(MON, 'Hétfő, 2. cs.: nincs délutános óvónő (10:30–17:00).')],
      away,
    )
    expect(days[0].fixes).toEqual([
      { kind: 'callIn', date: MON, staffId: 't4', name: 'T4' },
      { kind: 'callIn', date: MON, staffId: 'a1', name: 'A1' },
    ])
  })

  it('offers an absent civil when a teacher stands in as nanny', () => {
    const away = makeInput({ teachers: 5, nannies: 1, civils: 1, groups: 2, absent: { c1: [MON] } })
    const standIn = warning('SUBSTITUTION', MON, 'Hétfő, 2. cs.: dajka helyett óvónő — T5.', {
      cells: [{ staffId: 't5', date: MON, group: 2 }],
    })
    expect(warningDays([standIn], away).days[0].fixes).toEqual([
      { kind: 'callIn', date: MON, staffId: 'c1', name: 'C1' },
    ])
  })

  it('offers an absent teacher, not a nanny, when an asszisztens stands in', () => {
    const away = makeInput({
      teachers: 4,
      nannies: 3,
      assistants: 1,
      groups: 2,
      absent: { t4: [MON], n3: [MON] },
    })
    const standIn = warning('SUBSTITUTION', MON, 'Hétfő: A1 10–18, mert a 2. csoport …', {
      cells: [{ staffId: 'a1', date: MON, group: 2 }],
    })
    expect(warningDays([standIn], away).days[0].fixes).toEqual([
      { kind: 'callIn', date: MON, staffId: 't4', name: 'T4' },
    ])
  })
```

- [ ] **Step 2:** Run `npx vitest run tests/core/capacity.test.ts tests/ui/warningDays.test.ts`.
  Expected: FAIL. `cover` is not exported, `assistants` is missing from the capacity, and no
  helper is called in.

- [ ] **Step 3: Capacity.** In `src/core/capacity.ts`, import `type Role` with `SolveInput`.
  Then:
  - add to `DayCapacity`, after `nannies`:

```ts
  assistants: number // pedagógiai asszisztens present (v3-c)
  civils: number // civils present (v3-c)
```

  - replace `gMax`:

```ts
type Headcount = Pick<DayCapacity, 'teachers' | 'nannies' | 'assistants' | 'civils'>
type Day = Headcount & { groups: number }

/**
 * Groups a day can start: each needs its own teacher, and every nanny seat a nanny, a civil or a
 * spare teacher (civils since v3-c). An asszisztens can't start a group: it needs its DE teacher.
 */
export function gMax(teachers: number, nannies: number, civils = 0): number {
  return Math.min(teachers, Math.floor((teachers + nannies + civils) / 2))
}

/** Civils in nanny seats: only where the nannies run out, and before any teacher (v3-c). */
export function civilStandIns(c: Day): number {
  return Math.min(c.civils, Math.max(0, c.groups - c.nannies))
}

/** Teachers in nanny seats: the seats no nanny or civil fills. */
export function teacherStandIns(c: Day): number {
  return Math.max(0, c.groups - c.nannies - c.civils)
}

/** Teachers left for teacher seats. */
export function seatedTeachers(c: Day): number {
  return c.teachers - teacherStandIns(c)
}

/**
 * Asszisztens in DU teacher seats: only when a teacher seat would stay empty, one per group that
 * has a single teacher (who then takes DE) (v3-c).
 */
export function assistantStandIns(c: Day): number {
  const missing = 2 * c.groups - seatedTeachers(c)
  return missing > 0 ? Math.min(c.assistants, missing) : 0
}

/** Who covers `zeroHoleNeeds`: an asszisztens a DU teacher seat, a civil a nanny seat (v3-c). */
export function cover(c: Headcount): { teachers: number; nannies: number } {
  return { teachers: c.teachers + c.assistants, nannies: c.nannies + c.civils }
}
```

  - in `dayCapacities`, replace the `teachers` / `nannies` / `max` lines:

```ts
    const count = (role: Role) => present.filter((s) => s.role === role).length
    const teachers = count('teacher')
    const nannies = count('nanny')
    const assistants = count('assistant')
    const civils = count('civil')
    const max = gMax(teachers, nannies, civils)
```

    and add `assistants,` and `civils,` after `nannies,` in the returned object.

  - replace `groupsWithoutTeacherHoles`:

```ts
/** The largest group count below the day's that leaves no teacher seat empty, if any. */
export function groupsWithoutTeacherHoles(c: Day): number | undefined {
  for (let groups = c.groups - 1; groups >= 1; groups--) {
    const day = { ...c, groups }
    if (seatedTeachers(day) + assistantStandIns(day) >= 2 * groups) return groups
  }
  return undefined
}
```

  - replace the body of `expectedHoles`, and add *"and the helpers who fill seats (v3-c)"*
    to its doc comment:

```ts
  if (c.closed) return 0
  // A nanny, or a civil standing in, opens or closes, never both.
  const keys = Math.max(0, 2 - c.nannies - civilStandIns(c))
  if (c.gMax === 0) return 1 + keys
  const seated = seatedTeachers(c)
  const assistants = assistantStandIns(c)
  const seats = Math.max(0, 2 * c.groups - seated - assistants)
  // Ügyelet needs one group with its DE teacher and a DU teacher or asszisztens.
  const duty = seated > c.groups || assistants > 0 ? 0 : 1
  return seats + keys + duty
```

- [ ] **Step 4: The explain caller.** In `src/core/explain.ts`, replace
  `groupsWithoutTeacherHoles(c.teachers, c.nannies, c.groups)` with
  `groupsWithoutTeacherHoles(c)`.

- [ ] **Step 5: Call-ins.** In `src/ui/warningDays.ts`, replace `callIns`'s `helps` block:

```ts
  const { teachers, nannies, civils } = c
  const more = (t: number, n: number, k: number) =>
    reduced && gMax(teachers + t, nannies + n, civils + k) > gMax(teachers, nannies, civils)
  // Who stands in today (v3-c): an asszisztens in a DU teacher seat; a teacher or civil as nanny.
  const roleOf = new Map(input.staff.map((s) => [s.id, s.role]))
  const standIns = new Set(
    items
      .filter((w) => w.code === 'SUBSTITUTION')
      .map((w) => roleOf.get(w.cells[0]?.staffId ?? '') ?? 'teacher'),
  )
  const helps: Record<Role, boolean> = {
    teacher:
      codes.has('NO_TEACHER') ||
      codes.has('TEACHER_SEAT_EMPTY') ||
      standIns.has('assistant') ||
      more(1, 0, 0),
    nanny:
      codes.has('OPENER_MISSING') ||
      codes.has('CLOSER_MISSING') ||
      standIns.has('teacher') ||
      standIns.has('civil') ||
      more(0, 1, 0),
    assistant: codes.has('TEACHER_SEAT_EMPTY') || codes.has('DUTY_MISSING'),
    civil: standIns.has('teacher') || more(0, 0, 1),
  }
```

- [ ] **Step 6: Chips.** In `src/i18n/hu.ts`, replace `fewTeachers` and `fewNannies`:

```ts
    fewTeachers: (teachers: number, assistants: number, groups: number, need: number) =>
      `csak ${teachers} óvónő${assistants > 0 ? ` + ${assistants} asszisztens` : ''} — ${groups} csoporthoz ${need} kell`,
    fewNannies: (nannies: number, civils: number, need: number) =>
      `csak ${nannies} dajka${civils > 0 ? ` + ${civils} civil` : ''} — ${need} kell`,
```

  In `src/ui/DayChips.tsx`, import `cover`, and replace the two `if (c.teachers …)` /
  `if (c.nannies …)` lines:

```ts
  const have = cover(c)
  if (have.teachers < needs.teachers)
    notes.push(ui.roster.fewTeachers(c.teachers, c.assistants, c.groups, needs.teachers))
  if (have.nannies < needs.nannies)
    notes.push(ui.roster.fewNannies(c.nannies, c.civils, needs.nannies))
```

- [ ] **Step 7: Távol rows.** In `src/ui/AbsenceGrid.tsx`, import `cover`, `isHelper` and
  `ROLES`, and replace `coverage`:

```ts
  // Enough left for the week's groups? The same counting as the roster screen's day chips; only
  // teachers and nannies get the orange mark (v3-c).
  const coverage = (role: Role, date: string) => {
    const isAway = (p: Staff) => kindOf.has(`${p.id}|${date}`)
    const away = people.filter((p) => p.role === role && isAway(p)).length
    if (isHelper(role)) return { away, short: false }
    const [teachers, nannies, assistants, civils] = ROLES.map(
      (r) => people.filter((p) => p.role === r && !isAway(p)).length,
    )
    const have = cover({ teachers, nannies, assistants, civils })
    const needs = zeroHoleNeeds(groupCount(periodState(state, mondayOf(date))))
    return {
      away,
      short: role === 'teacher' ? have.teachers < needs.teachers : have.nannies < needs.nannies,
    }
  }
```

- [ ] **Step 8:** Run `npm run typecheck` and `npm test`. Expected: all green.

- [ ] **Step 9: Commit.**

```bash
git add -A src tests
git commit -m "feat(capacity): asszisztens and civils in the headcount, the quick-fix preview and call-ins"
```

---

### Task 3: Fairness leaves helpers out

**Files:** Modify `src/core/fairness.ts`. Test: `tests/core/fairness.test.ts`.

- [ ] **Step 1: Failing tests.** Append to `tests/core/fairness.test.ts` (import `makeInput` if
  it isn't already):

```ts
describe('helpers and fairness (v3-c)', () => {
  it('gives helpers no share at all', () => {
    const input = makeInput({ teachers: 4, nannies: 3, assistants: 1, civils: 1, groups: 2 })
    const ids = new Set(fairShares(input).map((s) => s.staffId))
    expect(ids.has('a1')).toBe(false)
    expect(ids.has('c1')).toBe(false)
  })

  it('counts a civil stand-in before a teacher one in the reserve pool', () => {
    // 2 groups, 1 nanny, 1 civil: the civil takes the second nanny seat, so all 5 teachers stay
    // teachers and one of them is reserve each day.
    const input = makeInput({ teachers: 5, nannies: 1, civils: 1, groups: 2, days: [D] })
    const reserve = fairShares(input).filter((s) => s.kind === 'reserve' && s.staffId[0] === 't')
    expect(reserve.reduce((sum, s) => sum + s.num / s.den, 0)).toBe(1)
  })

  it('leaves a day an asszisztens may stand in out of the ügyelet pool', () => {
    // 3 teachers, 2 groups: one DU seat is hers to fill, so the teachers' duty total isn't fixed.
    const input = makeInput({ teachers: 3, nannies: 2, assistants: 1, groups: 2, days: [D] })
    expect(fairShares(input).filter((s) => s.kind === 'duty')).toEqual([])
  })
})
```

  If `D` isn't defined in that file, add `const D = '2026-10-26'` at the top.

- [ ] **Step 2:** Run `npx vitest run tests/core/fairness.test.ts`. Expected: FAIL. `a1` and
  `c1` have morning shares, and the reserve pool is 0.

- [ ] **Step 3: Implement.** In `src/core/fairness.ts`, import `assistantStandIns`,
  `seatedTeachers` from `./capacity` and `isHelper` from `./types`. Then:
  - `const people = input.staff.filter((s) => s.active && !isHelper(s.role)) // helpers: no fairness (v3-c)`
  - in the reserve loop, replace the `substitutes` line and the pool expression:

```ts
      pool +=
        role === 'teacher'
          ? Math.max(0, seatedTeachers(c) - 2 * c.groups)
          : Math.max(0, c.nannies - c.groups)
```

  - replace the `dutyDays` filter, and add the asszisztens to its comment:

```ts
  // An asszisztens may hold a DU duty seat on a day she stands in (v3-c): then the teachers'
  // total isn't fixed, so that day stays out too.
  const dutyDays = open
    .filter((c) => c.groups >= 2 && seatedTeachers(c) > c.groups && assistantStandIns(c) === 0)
    .map((c) => c.date)
```

- [ ] **Step 4:** Run `npm run typecheck` and `npm test`. Expected: all green.

- [ ] **Step 5: Commit.**

```bash
git add src/core/fairness.ts tests/core/fairness.test.ts
git commit -m "feat(fairness): helpers outside every share; civils first in the reserve pool"
```

---

### Task 4: Validate the helper rules

**Files:** Modify `src/core/validate.ts`. Test: `tests/core/validate.test.ts`.

- [ ] **Step 1: Failing tests.** Append to `tests/core/validate.test.ts`:

```ts
describe('helpers (v3-c)', () => {
  // setup()'s day plus asszisztens a1 and civil c1, both on 8–16.
  function helped(): { input: SolveInput; roster: Roster } {
    const { input, roster } = setup()
    input.staff = makeStaff(2, 2, 1, 1)
    roster.assignments = [
      ...roster.assignments,
      { staffId: 'a1', date: D, shift: 'day', seat: { kind: 'helper', group: 1 } },
      { staffId: 'c1', date: D, shift: 'day' },
    ]
    return { input, roster }
  }

  it('accepts an asszisztens beside the DE teacher and a civil on 8–16', () => {
    const { input, roster } = helped()
    expect(validateRoster(input, roster)).toEqual([])
  })

  it('keeps 8–16 for helpers', () => {
    const { input, roster } = helped()
    expect(rules(input, edit(roster, 'n2', { shift: 'day' }))).toContain('dayShiftNotHelper')
  })

  it('takes an asszisztens as DU teacher only, on 10–18, flagged', () => {
    const { input, roster } = helped()
    const duSeat = { kind: 'teacher' as const, group: 1, shift: 'afternoon' as const }
    const standIn = edit(edit(roster, 't2', { seat: undefined }), 'a1', {
      shift: 'afternoon',
      seat: duSeat,
      substitution: true,
    })
    expect(validateRoster(input, standIn)).toEqual([])
    expect(rules(input, edit(standIn, 'a1', { shift: 'morning' }))).toContain('assistantNotAfternoon')
    expect(rules(input, edit(standIn, 'a1', { substitution: undefined }))).toContain('substitutionFlag')
  })

  it('never leaves a group without a real teacher', () => {
    const { input, roster } = helped()
    const noTeacher: Roster = {
      ...edit(edit(roster, 't1', { seat: undefined }), 't2', { seat: undefined }),
      holes: [{ kind: 'teacherSeat', date: D, group: 1, shift: 'morning' }],
    }
    const duSeat = { kind: 'teacher' as const, group: 1, shift: 'afternoon' as const }
    const alone = edit(noTeacher, 'a1', { shift: 'afternoon', seat: duSeat, substitution: true })
    expect(rules(input, alone)).toContain('groupWithoutTeacher')
  })

  it('seats one asszisztens per group, beside a DE teacher', () => {
    const { input, roster } = helped()
    expect(rules(input, edit(roster, 'c1', { seat: { kind: 'helper', group: 1 } }))).toContain(
      'helperSeatNotAssistant',
    )
    const noDe: Roster = {
      ...edit(roster, 't1', { seat: undefined }),
      holes: [{ kind: 'teacherSeat', date: D, group: 1, shift: 'morning' }],
    }
    expect(rules(input, noDe)).toContain('helperWithoutTeacher')
  })

  it('lets a civil stand in as nanny on 6–14 or 10–18, with a key', () => {
    const { input, roster } = helped()
    const standIn = edit(edit(roster, 'n1', { seat: undefined, opener: undefined }), 'c1', {
      shift: 'morning',
      seat: { kind: 'nanny', group: 1 },
      substitution: true,
      opener: true,
    })
    expect(validateRoster(input, standIn)).toEqual([])
    expect(rules(input, edit(standIn, 'c1', { shift: 'day', opener: undefined }))).toContain(
      'standInOnDay',
    )
  })

  it('gives no key to a civil out of a nanny seat, nor to an asszisztens', () => {
    const { input, roster } = helped()
    const civilKey = edit(edit(roster, 'n1', { opener: undefined }), 'c1', {
      shift: 'morning',
      opener: true,
    })
    expect(rules(input, civilKey)).toContain('keyNotNanny')
  })
})
```

  Add `makeStaff` to the fixtures import.

- [ ] **Step 2:** Run `npx vitest run tests/core/validate.test.ts`. Expected: FAIL. Helpers
  trip `nannyInTeacherSeat`, `substitutionFlag` and `keyNotNanny`, and the new rules don't exist.

- [ ] **Step 3: Implement.** In `src/core/validate.ts`, import `isHelper`. Replace the
  per-assignment loop, `for (const a of today) { … }`:

```ts
    for (const a of today) {
      const role = people.get(a.staffId)?.role
      if (a.shift === 'day' && !(role && isHelper(role))) fail('dayShiftNotHelper', date, a.staffId)
      if (!a.seat) {
        if (a.substitution) fail('substitutionWithoutSeat', date, a.staffId)
      } else if (a.seat.group < 1 || a.seat.group > cap.groups) {
        fail('seatInMissingGroup', date, a.staffId)
      } else if (a.seat.kind === 'helper') {
        // Beside the DE teacher, on any hours she was given (v3-c).
        if (role !== 'assistant') fail('helperSeatNotAssistant', date, a.staffId)
        if (a.substitution) fail('substitutionFlag', date, a.staffId)
      } else if (a.seat.kind === 'teacher') {
        if (role === 'nanny') fail('nannyInTeacherSeat', date, a.staffId)
        if (role === 'civil') fail('civilInTeacherSeat', date, a.staffId)
        if (role === 'assistant' && (a.seat.shift !== 'afternoon' || a.shift !== 'afternoon'))
          fail('assistantNotAfternoon', date, a.staffId)
        if (a.seat.shift !== a.shift) fail('teacherSeatOffShift', date, a.staffId)
        if ((role === 'assistant') !== (a.substitution === true))
          fail('substitutionFlag', date, a.staffId)
      } else {
        if (role === 'assistant') fail('assistantInNannySeat', date, a.staffId)
        if (role === 'civil' && a.shift === 'day') fail('standInOnDay', date, a.staffId)
        if ((role !== 'nanny') !== (a.substitution === true)) fail('substitutionFlag', date, a.staffId)
      }
      // A nanny holds a key, or a civil standing in for one (v3-c).
      const keyHolder = role === 'nanny' || (role === 'civil' && a.seat?.kind === 'nanny')
      if ((a.opener || a.closer) && !keyHolder) fail('keyNotNanny', date, a.staffId)
      if (a.opener && a.shift !== 'morning') fail('openerNotMorning', date, a.staffId)
      if (a.closer && a.shift !== 'afternoon') fail('closerNotAfternoon', date, a.staffId)
    }
```

  In the per-group loop, replace `let emptyTeacherSeats = 0`, the
  `emptyTeacherSeats += empty` line and the `if (emptyTeacherSeats > 1)` line. Count real
  teachers instead:

```ts
      let teachersSeated = 0
      for (const t of SHIFTS) {
        const seated = today.filter(
          (a) => a.seat?.kind === 'teacher' && a.seat.group === g && a.seat.shift === t,
        )
        const empty = holes.filter(
          (h) => h.kind === 'teacherSeat' && h.group === g && h.shift === t,
        ).length
        if (seated.length + empty !== 1) fail('teacherSeatNotFilledOnce', date)
        teachersSeated += seated.filter((a) => people.get(a.staffId)?.role === 'teacher').length
      }
      // Group minimum: a real teacher, whoever else stands in (v3-c).
      if (teachersSeated === 0) fail('groupWithoutTeacher', date)
      const besides = today.filter((a) => a.seat?.kind === 'helper' && a.seat.group === g)
      if (besides.length > 1) fail('helperSeatTwice', date)
      const deTeacher = today.some(
        (a) =>
          a.seat?.kind === 'teacher' &&
          a.seat.group === g &&
          a.seat.shift === 'morning' &&
          people.get(a.staffId)?.role === 'teacher',
      )
      if (besides.length > 0 && !deTeacher) fail('helperWithoutTeacher', date)
```

  Update the doc comment of `validateRoster`: *"…every strict rule (§6.2, helpers since v3-c)…"*.

- [ ] **Step 4:** Run `npm run typecheck` and `npm test`. Expected: all green.

- [ ] **Step 5: Commit.**

```bash
git add src/core/validate.ts tests/core/validate.test.ts
git commit -m "feat(validate): helper seats, stand-ins on the right hours, a real teacher per group"
```

---

### Task 5: Helpers in the solver

**Files:** Modify `src/core/model.ts`, `src/core/solve.ts`, `src/i18n/hu.ts`. Test:
`tests/core/model.test.ts`.

- [ ] **Step 1: Failing tests.** Append to `tests/core/model.test.ts`:

```ts
describe('helpers (v3-c)', () => {
  const on = (roster: ReturnType<typeof solveValid>, id: string, date = D) =>
    roster.assignments.find((a) => a.staffId === id && a.date === date)

  it('keeps an asszisztens on 8–16 beside a DE teacher when no teacher is missing', () => {
    const roster = solveValid(
      makeInput({ teachers: 4, nannies: 2, assistants: 1, groups: 2, days: consecutiveDays(D, 3) }),
    )
    for (const date of roster.period.days) {
      const a1 = on(roster, 'a1', date)!
      expect(a1.shift).toBe('day')
      expect(a1.seat?.kind).toBe('helper')
      const de = roster.assignments.find(
        (a) =>
          a.date === date &&
          a.seat?.kind === 'teacher' &&
          a.seat.shift === 'morning' &&
          a.seat.group === a1.seat!.group,
      )
      expect(de?.staffId[0]).toBe('t')
    }
    // The switches stage keeps her in one group.
    expect(new Set(roster.assignments.filter((a) => a.staffId === 'a1').map((a) => a.seat?.group)).size).toBe(1)
  })

  it('moves her to 10–18 only for a missing DU teacher, and the group keeps its DE teacher', () => {
    const roster = solveValid(makeInput({ teachers: 3, nannies: 2, assistants: 1, groups: 2, days: [D] }))
    expect(roster.holes).toEqual([])
    const a1 = on(roster, 'a1')!
    expect(a1).toMatchObject({ shift: 'afternoon', substitution: true })
    expect(a1.seat).toMatchObject({ kind: 'teacher', shift: 'afternoon' })
  })

  it('puts a civil in a nanny seat before a teacher, on 6–14 or 10–18', () => {
    const roster = solveValid(makeInput({ teachers: 5, nannies: 1, civils: 1, groups: 2, days: [D] }))
    expect(roster.assignments.filter((a) => a.substitution).map((a) => a.staffId)).toEqual(['c1'])
    expect(on(roster, 'c1')!.shift).not.toBe('day')
  })

  it('lets a civil stand-in hold the key a lone nanny cannot', () => {
    const roster = solveValid(makeInput({ teachers: 4, nannies: 1, civils: 1, groups: 2, days: [D] }))
    expect(roster.holes).toEqual([])
    const c1 = on(roster, 'c1')!
    expect(c1.opener || c1.closer).toBe(true)
  })

  it('keeps a civil on 8–16, out of every seat, while the nannies suffice', () => {
    const roster = solveValid(makeInput({ teachers: 4, nannies: 3, civils: 1, groups: 2, days: [D] }))
    expect(on(roster, 'c1')).toEqual({ staffId: 'c1', date: D, shift: 'day' })
  })

  it('leaves the extra asszisztens in no group', () => {
    const roster = solveValid(makeInput({ teachers: 2, nannies: 1, assistants: 2, groups: 1, days: [D] }))
    const seats = ['a1', 'a2'].map((id) => on(roster, id)!.seat?.kind)
    expect(seats.sort()).toEqual(['helper', undefined])
  })

  it('lets her DU stand-in group be the ügyelet', () => {
    // 2 teachers, 2 groups: no group has both teachers; her group can.
    const roster = solveValid(makeInput({ teachers: 2, nannies: 2, assistants: 1, groups: 2, days: [D] }))
    expect(roster.holes.filter((h) => h.kind === 'duty')).toEqual([])
    expect(on(roster, 'a1')!.duty).toBe(true)
  })
})
```

- [ ] **Step 2:** Run `npx vitest run tests/core/model.test.ts`. Expected: FAIL. Helpers get
  DE/DU shifts and no seats.

- [ ] **Step 3: Variables and stages.** In `src/core/model.ts`:
  - imports:
    `import { dayCapacities, seatedTeachers, type DayCapacity } from './capacity'` and
    `import { HELPER_SHIFTS, SHIFTS, isHelper, type Role, type Shift, type SolveInput, type Staff } from './types'`
  - in `STAGES`, insert `'helpers',` after `'keepDuties',`
  - in `INTEGRAL_STAGES`, add `'helpers',` after `'keepDuties',`
  - extend the `STAGES` doc comment: *"…the keys last. 'helpers' (v3-c) seats an asszisztens
    beside a group once the keep* stages are done."*
  - in `v`, add after `nannySeat`:

```ts
  helperSeat: (p: number, d: number, g: number) => `h_${p}_${d}_${g}`,
```

- [ ] **Step 4: Signature.** Replace `export function buildModel(input: SolveInput): RosterModel {` with:

```ts
/**
 * The MILP for `input`. Days before `keepBefore` (a recalculation's kept past) are pinned by
 * `anchorModel` to what was worked: they get every seat a hand edit can make, ungated, and no
 * 8–16 rule (v3-c).
 */
export function buildModel(input: SolveInput, keepBefore?: string): RosterModel {
```

  Right after the `days` declaration, add
  `const capacityOf = new Map(capacities.map((c) => [c.date, c]))`. Replace
  `const isTeacher = (p: number) => people[p].role === 'teacher'` with:

```ts
  const roleOf = (p: number): Role => people[p].role
  const isTeacher = (p: number) => roleOf(p) === 'teacher'
```

  Before `// ── Strict rules`, add:

```ts
  // Per day, per person: the key variables of those who can hold one (nannies; civils standing in).
  const keys = days.map(() => new Map<number, { open: string; close: string }>())
  // Per day: the asszisztens who may take a DU teacher seat (v3-c).
  const standInAssistantsOn: number[][] = days.map(() => [])
```

- [ ] **Step 5: Strict rules.** Replace the whole `for (const day of days) { … }` block under
  `// ── Strict rules (§6.2)` (from `const d = day.index` to the closing `}` after the
  `holeClose` constraints) with:

```ts
  for (const day of days) {
    const d = day.index
    const groups = groupNumbers(day.groups)
    const pinned = keepBefore !== undefined && day.date < keepBefore
    const withRole = (role: Role) => day.present.filter((p) => roleOf(p) === role)
    const teachers = withRole('teacher')
    const nannies = withRole('nanny')
    const assistants = withRole('assistant')
    // A stand-in only ever fills a seat its own role can't (v3-c): a civil, then a teacher, a
    // nanny seat; an asszisztens a DU teacher seat. A kept day had whatever was worked.
    const shortOfNannies = pinned || nannies.length < day.groups
    const substitutes = shortOfNannies ? teachers : []
    const civilStandIns = shortOfNannies ? withRole('civil') : []
    const seated = seatedTeachers(capacityOf.get(day.date)!)
    const standInAssistants = pinned || seated < 2 * day.groups ? assistants : []
    standInAssistantsOn[d] = standInAssistants

    for (const p of day.present) {
      const own = isHelper(roleOf(p)) ? HELPER_SHIFTS : SHIFTS
      const shifts = Lin.sum(own.map((t) => milp.binary(v.shift(p, d, t))))
      milp.constrain(shifts, '=', 1) // present ⇒ exactly one shift
    }
    for (const p of teachers) {
      for (const t of SHIFTS) {
        const onShift = Lin.sum(groups.map((g) => seat(v.teacherSeat(p, d, g, t), d, p, g)))
        milp.constrain(onShift, '<=', new Lin().add(v.shift(p, d, t))) // teacher seat only on own shift
      }
    }
    // Each helper's stand-in seats (v3-c); without one, 8–16.
    const standIn = new Map<number, Lin>()
    for (const p of standInAssistants) {
      const held = Lin.sum(groups.map((g) => seat(v.teacherSeat(p, d, g, 'afternoon'), d, p, g)))
      milp.constrain(held, '<=', new Lin().add(v.shift(p, d, 'afternoon'))) // 10–18 covers the DU seat
      objectives.substitutions.plus(held)
      standIn.set(p, held)
    }
    for (const p of assistants) {
      for (const g of groups) seat(v.helperSeat(p, d, g), d, p, g)
    }
    for (const p of substitutes) {
      for (const g of groups) {
        const name = seat(v.substitution(p, d, g), d, p, g)
        objectives.substitutions.add(name, 3) // a teacher as nanny is the last resort (v3-c)
        nannySeatHolder(d, g, p, name)
      }
    }
    for (const p of civilStandIns) {
      const held = new Lin()
      for (const g of groups) {
        const name = seat(v.substitution(p, d, g), d, p, g)
        objectives.substitutions.add(name)
        nannySeatHolder(d, g, p, name)
        held.add(name)
      }
      milp.constrain(held, '<=', Lin.sum(SHIFTS.map((t) => v.shift(p, d, t)))) // a nanny's hours
      standIn.set(p, held)
    }
    if (!pinned) {
      for (const p of day.present.filter((q) => isHelper(roleOf(q)))) {
        // 8–16 unless standing in: the solver moves a helper only to fill a seat.
        const moved = Lin.sum(SHIFTS.map((t) => v.shift(p, d, t)))
        milp.constrain(moved, '<=', standIn.get(p) ?? 0)
      }
      for (const p of assistants) {
        // An asszisztens on 8–16 out of every group costs 1 (the 'helpers' stage).
        objectives.helpers.add(v.shift(p, d, 'day'))
        for (const g of groups) objectives.helpers.add(v.helperSeat(p, d, g), -1)
      }
    }
    const keyHolders = [...nannies, ...civilStandIns]
    for (const p of nannies) {
      for (const g of groups) nannySeatHolder(d, g, p, seat(v.nannySeat(p, d, g), d, p, g))
    }
    for (const p of keyHolders) {
      const open = milp.binary(v.open(p, d))
      const close = milp.binary(v.close(p, d))
      milp.constrain(new Lin().add(open), '<=', new Lin().add(v.shift(p, d, 'morning')))
      milp.constrain(new Lin().add(close), '<=', new Lin().add(v.shift(p, d, 'afternoon')))
      keys[d].set(p, { open, close })
    }
    for (const p of civilStandIns) {
      // A civil holds a key only as a stand-in nanny.
      const { open, close } = keys[d].get(p)!
      milp.constrain(new Lin().add(open).add(close), '<=', standIn.get(p)!)
    }
    for (const p of day.present) {
      if (!seats[d][p].isEmpty()) milp.constrain(seats[d][p], '<=', 1) // at most one seat a day
    }

    for (const g of groups) {
      for (const t of SHIFTS) {
        const hole = milp.binary(v.holeTeacher(d, g, t))
        objectives.holes.add(hole)
        const holders = t === 'afternoon' ? [...teachers, ...standInAssistants] : teachers
        const filled = Lin.sum(holders.map((p) => v.teacherSeat(p, d, g, t))).add(hole)
        milp.constrain(filled, '=', 1) // each teacher seat: a person or a hole
      }
      const bothEmpty = Lin.sum(SHIFTS.map((t) => v.holeTeacher(d, g, t)))
      milp.constrain(bothEmpty, '<=', 1) // group minimum: ≥ 1 teacher
      const noDe = v.holeTeacher(d, g, 'morning')
      if (standInAssistants.length > 0) {
        // Her DU stand-in leaves the group a real teacher: its DE seat is filled.
        const du = Lin.sum(standInAssistants.map((p) => v.teacherSeat(p, d, g, 'afternoon')))
        milp.constrain(du.add(noDe), '<=', 1)
      }
      if (assistants.length > 0) {
        // At most one asszisztens beside a group, and only beside its DE teacher.
        const beside = Lin.sum(assistants.map((p) => v.helperSeat(p, d, g)))
        milp.constrain(beside.add(noDe), '<=', 1)
      }
      const nannySeat = Lin.sum([
        ...nannies.map((p) => v.nannySeat(p, d, g)),
        ...substitutes.map((p) => v.substitution(p, d, g)),
        ...civilStandIns.map((p) => v.substitution(p, d, g)),
      ])
      milp.constrain(nannySeat, '=', 1) // nanny seat always filled
    }

    const holeOpen = milp.binary(v.holeOpen(d))
    const holeClose = milp.binary(v.holeClose(d))
    objectives.holes.add(holeOpen).add(holeClose)
    milp.constrain(Lin.sum(keyHolders.map((p) => v.open(p, d))).add(holeOpen), '=', 1)
    milp.constrain(Lin.sum(keyHolders.map((p) => v.close(p, d))).add(holeClose), '=', 1)
  }
```

- [ ] **Step 6: Ügyelet.** In the ügyelet block, replace the inner `for (const t of SHIFTS) { … }`:

```ts
      for (const t of SHIFTS) {
        const holders = new Lin()
        const teachers = day.present.filter(isTeacher)
        const seated = t === 'afternoon' ? [...teachers, ...standInAssistantsOn[d]] : teachers
        for (const p of seated) {
          const z = milp.nonNegative(v.onDuty(p, d, g, t))
          milp.constrain(new Lin().add(z), '<=', new Lin().add(v.teacherSeat(p, d, g, t)))
          holders.add(z)
          // An asszisztens's 10–18 already covers 17:30: no hours move, no fairness count (v3-c).
          if (isTeacher(p)) duty[d][p].add(z)
        }
        milp.constrain(holders, '=', new Lin().add(y))
      }
```

  Change the `duty` field's comment in `RosterModel` to
  `/** Per day, per person: a teacher's ügyelet (sums to 0 or 1; empty for everyone else). */`.

- [ ] **Step 7: Soft rules, keys, turnarounds.**
  - In the keys-from-reserve loop, replace
    `for (const p of day.present.filter((q) => !isTeacher(q))) {` with
    `for (const p of day.present.filter((q) => roleOf(q) === 'nanny')) {`.
  - Replace the *"Nobody opens, or closes"* block:

```ts
  // Nobody opens, or closes, on every working day of the period: nannies, and civils standing in.
  if (days.length >= 2) {
    people.forEach((_, p) => {
      const held = days.map((day) => keys[day.index].get(p))
      if (held.some((k) => k === undefined)) return
      milp.constrain(Lin.sum(held.map((k) => k!.open)), '<=', days.length - 1)
      milp.constrain(Lin.sum(held.map((k) => k!.close)), '<=', days.length - 1)
    })
  }
```

  - In the turnaround check, replace `if (nextCalendarDay && !isTeacher(p)) {` with
    `if (nextCalendarDay && roleOf(p) === 'nanny') {`.

- [ ] **Step 8: Decode.** In `src/core/solve.ts`:
  - replace `const model = buildModel(input)` with `const model = buildModel(input, anchor?.from)`
  - in `decode`, replace the `shift:` line:

```ts
        shift: on(v.shift(p, d, 'morning'))
          ? 'morning'
          : on(v.shift(p, d, 'day'))
            ? 'day'
            : 'afternoon',
```

  - replace the teacher-seat `if` inside `for (const t of SHIFTS)`:

```ts
          if (on(v.teacherSeat(p, d, g, t))) {
            assignment.seat = { kind: 'teacher', group: g, shift: t }
            if (model.people[p].role === 'assistant') assignment.substitution = true
          }
```

  - after it (still inside `for (const g of groups)`), add:

```ts
        if (on(v.helperSeat(p, d, g))) assignment.seat = { kind: 'helper', group: g }
```

  The civil stand-in decodes through the existing `v.substitution` branch.

- [ ] **Step 9: Her words for the new stage.** In `src/i18n/hu.ts`, add
  `helpers: 'az asszisztensek elhelyezésénél',` to `STOPPED_AT` after `keepDuties`, and change
  `substitutions` to `'a helyettesítéseknél'`.

- [ ] **Step 10:** Run `npx vitest run tests/core/model.test.ts`. Expected: PASS. Then
  `npm run typecheck` and `npm test`. Teacher stand-ins now weigh 3, so the substitutions
  stage's objective values change. The rosters shouldn't: there's no civil in any older test.
  Expect the watchdog test to pass: 15 stages × 30 s = 450 s < 480 s.

- [ ] **Step 11: Commit.**

```bash
git add src/core/model.ts src/core/solve.ts src/i18n/hu.ts tests/core/model.test.ts
git commit -m "feat(solver): asszisztens beside a group or as DU stand-in, civils before teachers as nannies"
```

---

### Task 6: Recalculation and edits

**Files:** Modify `src/core/recalc.ts`, `src/core/edit.ts`. Tests: `tests/core/recalc.test.ts`,
`tests/core/edit.test.ts`.

- [ ] **Step 1: Failing tests.** Append to `tests/core/recalc.test.ts`:

```ts
describe('helpers in a week in progress (v3-c)', () => {
  const helperWeek = makeInput({
    teachers: 4,
    nannies: 2,
    assistants: 1,
    civils: 1,
    groups: 2,
    days: [MON, TUE, WED],
  })
  const helperPlan = solve(helperWeek, highs, TEST_META)

  it("keeps a past by-hand 6–14, and plans today's 8–16 again", () => {
    const byHand: Roster = {
      ...helperPlan,
      edited: true,
      assignments: helperPlan.assignments.map((a) =>
        a.staffId === 'a1' && a.date === MON ? { ...a, shift: 'morning' } : a,
      ),
    }
    const result = makeRoster(helperWeek, highs, TEST_META, keeping(TUE, byHand))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const a1 = (date: string) =>
      result.roster.assignments.find((a) => a.staffId === 'a1' && a.date === date)!
    expect(a1(MON).shift).toBe('morning')
    expect(a1(TUE).shift).toBe('day')
  })

  it('keeps her seat beside the group when nothing changed', () => {
    const result = makeRoster(helperWeek, highs, TEST_META, keeping(TUE, helperPlan))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const seatOf = (r: Roster) =>
      r.assignments.filter((a) => a.staffId === 'a1').map((a) => a.seat)
    expect(seatOf(result.roster)).toEqual(seatOf(helperPlan))
  })
})
```

  Append to `tests/core/edit.test.ts` (import `editShift` and `setShift` from
  `../../src/core/edit`):

```ts
describe('a helper shift by hand (v3-c)', () => {
  const helperInput = makeInput({ teachers: 3, nannies: 3, assistants: 1, groups: 1, days: [WED] })
  const helped: Roster = {
    ...roster,
    assignments: [
      ...roster.assignments,
      { staffId: 'a1', date: WED, shift: 'day', seat: { kind: 'helper', group: 1 } },
    ],
  }

  it('changes only the hours, keeping the seat', () => {
    const moved = setShift(helped, { date: WED, staffId: 'a1', shift: 'morning' })
    expect(moved.assignments.find((a) => a.staffId === 'a1')).toEqual({
      staffId: 'a1',
      date: WED,
      shift: 'morning',
      seat: { kind: 'helper', group: 1 },
    })
  })

  it('marks the roster edited, explained and balanced', () => {
    const result = editShift(helperInput, helped, { date: WED, staffId: 'a1', shift: 'afternoon' })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.roster.edited).toBe(true)
  })

  it('refuses hours that break a stand-in', () => {
    const standIn: Roster = {
      ...helped,
      assignments: helped.assignments.map((a) =>
        a.staffId === 't2'
          ? { ...a, seat: undefined }
          : a.staffId === 'a1'
            ? {
                ...a,
                shift: 'afternoon',
                seat: { kind: 'teacher', group: 1, shift: 'afternoon' },
                substitution: true,
              }
            : a,
      ),
    }
    const result = editShift(helperInput, standIn, { date: WED, staffId: 'a1', shift: 'morning' })
    expect(result.ok ? [] : result.violations.map((v) => v.rule)).toContain('assistantNotAfternoon')
  })

  it('flags a civil who takes a nanny seat in a swap as a stand-in', () => {
    const staff = makeStaff(3, 3, 0, 1)
    const withCivil: Roster = {
      ...roster,
      assignments: [...roster.assignments, { staffId: 'c1', date: WED, shift: 'morning' }],
    }
    const swapped = swapDay(withCivil, staff, { date: WED, a: 'n1', b: 'c1' })
    expect(swapped.assignments.find((a) => a.staffId === 'c1')?.substitution).toBe(true)
  })
})
```

  Add `makeInput` to the fixtures import if it isn't there.

- [ ] **Step 2:** Run `npx vitest run tests/core/recalc.test.ts tests/core/edit.test.ts`.
  Expected: FAIL. `setShift` / `editShift` don't exist, and the pinned Monday `morning` conflicts
  (or throws *No such seat* for the helper seat).

- [ ] **Step 3: Recalc.** In `src/core/recalc.ts`, in `anchorModel`:
  - delete the `isNanny` helper, and add
    `const holdsKeys = (p: number, d: number) => declared.has(v.open(p, d))`
  - in `seatOf`, replace the `name` expression:

```ts
    const name =
      a.seat.kind === 'teacher'
        ? v.teacherSeat(p, d, a.seat.group, a.seat.shift)
        : a.seat.kind === 'helper'
          ? v.helperSeat(p, d, a.seat.group)
          : a.substitution
            ? v.substitution(p, d, a.seat.group)
            : v.nannySeat(p, d, a.seat.group)
```

  - in the kept-day branch, replace
    `milp.constrain(new Lin().add(v.shift(p, d, a.shift)), '=', 1)` with:

```ts
        const shift = v.shift(p, d, a.shift)
        if (!declared.has(shift)) throw new Error(`No ${a.shift} shift for ${people[p].id} on ${day.date}`)
        milp.constrain(new Lin().add(shift), '=', 1)
```

  - in that branch, and again in the minimal branch, replace `if (isNanny(p)) {` with
    `if (holdsKeys(p, d)) {`
  - in the minimal branch, replace
    `milp.constrain(new Lin().add(hours), '>=', differs(v.shift(p, d, a.shift), true))` with:

```ts
      const kept = v.shift(p, d, a.shift)
      // A shift this person can no longer have (a role changed since) is a change too.
      milp.constrain(
        new Lin().add(hours),
        '>=',
        declared.has(kept) ? differs(kept, true) : Lin.constant(1),
      )
```

- [ ] **Step 4: Edits.** Replace `src/core/edit.ts` below the imports. Import `type Shift`
  with the other types.

```ts
/** Two people who both work on `date` (staff ids). */
export type Swap = { date: string; a: string; b: string }

/** A helper's hours by hand (v3-c): 8–16, 6–14 or 10–18. */
export type ShiftChange = { date: string; staffId: string; shift: Shift }

/**
 * Exchanges two people's day: shift, seat, opener, closer and ügyelet. `substitution` follows the
 * new holder's role (someone in another role's seat), so the result reads like a solver roster.
 * Checks no rule — `editRoster` does that.
 */
export function swapDay(roster: Roster, staff: Staff[], swap: Swap): Roster {
  const { date, a, b } = swap
  if (a === b) throw new Error('A swap needs two different people')
  const role = new Map(staff.map((s) => [s.id, s.role]))
  const dayOf = (staffId: string) => {
    const found = roster.assignments.find((x) => x.staffId === staffId && x.date === date)
    if (!found) throw new Error(`${staffId} does not work on ${date}`)
    return found
  }
  const first = dayOf(a)
  const second = dayOf(b)
  const takeOver = (holder: Assignment, from: Assignment): Assignment => {
    const next: Assignment = { staffId: holder.staffId, date, shift: from.shift }
    if (from.seat) next.seat = from.seat
    const own = role.get(holder.staffId)
    if (
      (from.seat?.kind === 'nanny' && own !== 'nanny') ||
      (from.seat?.kind === 'teacher' && own !== 'teacher')
    ) {
      next.substitution = true
    }
    if (from.opener) next.opener = true
    if (from.closer) next.closer = true
    if (from.duty) next.duty = true // ügyelet belongs to the seat
    return next
  }
  return {
    ...roster,
    assignments: roster.assignments.map((x) =>
      x === first ? takeOver(first, second) : x === second ? takeOver(second, first) : x,
    ),
  }
}

/** Sets one person's hours, keeping seat, keys and ügyelet. Checks no rule — `editShift` does. */
export function setShift(roster: Roster, change: ShiftChange): Roster {
  const { date, staffId, shift } = change
  const at = (a: Assignment) => a.staffId === staffId && a.date === date
  if (!roster.assignments.some(at)) throw new Error(`${staffId} does not work on ${date}`)
  return { ...roster, assignments: roster.assignments.map((a) => (at(a) ? { ...a, shift } : a)) }
}

/**
 * A hand edit through the same gate as a solve: every strict rule re-checked, the warnings
 * explained again. A roster that breaks a rule never comes back — the caller shows why instead.
 * With `from` (a week in progress) the days before it are history, checked the way `makeRoster`
 * checks them: as they were worked, not against absences or group counts set since.
 */
function gate(
  input: SolveInput,
  roster: Roster,
  from: string | undefined,
  change: (staff: Staff[]) => Roster,
): RosterResult {
  const checked = (from && recalcInput(input, { roster, from, mode: 'minimal' })) || input
  const next = change(checked.staff)
  const violations = validateRoster(checked, next)
  if (violations.length > 0) return { ok: false, violations }
  return {
    ok: true,
    roster: {
      ...next,
      edited: true,
      warnings: explain(checked, next),
      balance: balanceOf(checked, next),
    },
  }
}

export function editRoster(input: SolveInput, roster: Roster, swap: Swap, from?: string) {
  return gate(input, roster, from, (staff) => swapDay(roster, staff, swap))
}

/** A helper's shift by hand (v3-c): like a swap, `edited`, and a re-solve drops it. */
export function editShift(input: SolveInput, roster: Roster, change: ShiftChange, from?: string) {
  return gate(input, roster, from, () => setShift(roster, change))
}
```

- [ ] **Step 5:** Run `npm run typecheck` and `npm test`. Expected: all green.

- [ ] **Step 6: Commit.**

```bash
git add src/core/recalc.ts src/core/edit.ts tests/core/recalc.test.ts tests/core/edit.test.ts
git commit -m "feat(edit): a helper's hours by hand; recalc keeps helper seats and past by-hand hours"
```

---

### Task 7: Warnings that say why

**Files:** Modify `src/core/explain.ts`, `src/i18n/hu.ts`. Tests: `tests/core/explain.test.ts`,
`tests/i18n/warningText.test.ts`.

- [ ] **Step 1: Failing tests.** Append to `tests/i18n/warningText.test.ts` (import
  `warningText as t` if the file names it differently, match its existing import):

```ts
describe('helper stand-ins (v3-c)', () => {
  it('names the hours and why', () => {
    expect(t.helperStandIn('2026-10-26', 1, 'teacher', 'Bea', '10–18')).toBe(
      'Hétfő: Bea 10–18, mert az 1. csoport DU óvónője hiányzik.',
    )
    expect(t.helperStandIn('2026-10-27', 2, 'nanny', 'Zsófi', '6–14')).toBe(
      'Kedd: Zsófi 6–14, mert a 2. csoport dajkája hiányzik.',
    )
  })
})
```

  Append to `tests/core/explain.test.ts`:

```ts
describe('explain — helpers (v3-c)', () => {
  it("gives a helper stand-in the hours and the reason, and the asszisztens beside a group nothing", () => {
    const input = makeInput({ teachers: 3, nannies: 2, assistants: 2, groups: 2, days: [D] })
    const roster = solve(input, highs, TEST_META)
    const subs = explain(input, roster).filter((w) => w.code === 'SUBSTITUTION')
    expect(subs).toHaveLength(1)
    expect(resolveNames(subs[0].text, input.staff)).toMatch(/^Hétfő: A\d 10–18, mert /)
  })
})
```

  Use the file's existing names for `D`, `highs`, `solve` and `resolveNames`, and add any missing
  import (`resolveNames` from `../../src/core/names`, `solve` from `../../src/core/solve`).

- [ ] **Step 2:** Run `npx vitest run tests/i18n/warningText.test.ts tests/core/explain.test.ts`.
  Expected: FAIL. `helperStandIn` doesn't exist.

- [ ] **Step 3: Text.** In `src/i18n/hu.ts`, in `warningText`, after `substitution`:

```ts
  /** Why a helper's hours moved (v3-c): 'Hétfő: Bea 10–18, mert az 1. csoport DU óvónője hiányzik.' */
  helperStandIn: (
    date: string,
    group: number,
    seat: 'teacher' | 'nanny',
    name: string,
    hours: string,
  ) =>
    `${capitalize(dayName(date))}: ${name} ${hours}, mert ${article(group)} ${groupName(group)} ${
      seat === 'teacher' ? 'DU óvónője' : 'dajkája'
    } hiányzik.`,
```

- [ ] **Step 4: Explain.** In `src/core/explain.ts`, import `isHelper` and `helperShort`
  (`import { CALL_IN_ORDER, helperShort, warningText as t } from '../i18n/hu'`). Replace the
  substitution loop:

```ts
  for (const a of roster.assignments) {
    if (!a.substitution || !a.seat || a.seat.kind === 'helper') continue
    const role = staff.get(a.staffId)?.role
    const text =
      role && isHelper(role)
        ? t.helperStandIn(a.date, a.seat.group, a.seat.kind, name(a.staffId), helperShort[a.shift])
        : t.substitution(a.date, a.seat.group, name(a.staffId))
    add('SUBSTITUTION', a.date, text, {
      cells: [{ staffId: a.staffId, date: a.date, group: a.seat.group }],
    })
  }
```

- [ ] **Step 5:** Run `npm run typecheck` and `npm test`. Expected: all green.

- [ ] **Step 6: Commit.**

```bash
git add src/core/explain.ts src/i18n/hu.ts tests/core/explain.test.ts tests/i18n/warningText.test.ts
git commit -m "feat(warnings): a helper stand-in says its hours and why"
```

---

### Task 8: Views, print, Excel, the phone list

**Files:** Modify `src/export/views.ts`, `src/ui/highlight.ts`, `src/i18n/hu.ts`. Tests:
`tests/export/views.test.ts`, `tests/ui/helpers.test.ts` (the highlight tests),
`tests/i18n/recalcText.test.ts`.

- [ ] **Step 1: Failing tests.** Append to `tests/export/views.test.ts`:

```ts
describe('helpers (v3-c)', () => {
  const helperStaff = makeStaff(3, 2, 2, 1)
  const helped: Roster = {
    ...roster,
    assignments: [
      ...roster.assignments,
      { staffId: 'a1', date: TUE, shift: 'day', seat: { kind: 'helper', group: 1 } },
      { staffId: 'a2', date: TUE, shift: 'day' },
      { staffId: 'c1', date: TUE, shift: 'day' },
    ],
  }

  it('shows the asszisztens beside her group, and the rest on one helper row', () => {
    const view = groupView(helped, helperStaff)
    const tue = view.days.indexOf(TUE)
    expect(view.rows[0].cells[tue].map((l) => l.text)).toContain('Asszisztens: A1 (8–16)')
    const last = view.rows.at(-1)!
    expect(last.label).toBe('Asszisztens, civil')
    expect(last.cells[tue].map((l) => l.text)).toEqual(['Asszisztens: A2 (8–16)', 'Civil: C1 (8–16)'])
  })

  it('shows a stand-in in the substitution tone, with hours', () => {
    const standIn: Roster = {
      ...roster,
      assignments: [
        ...roster.assignments,
        {
          staffId: 'a1',
          date: TUE,
          shift: 'afternoon',
          seat: { kind: 'teacher', group: 2, shift: 'afternoon' },
          substitution: true,
        },
      ],
      holes: roster.holes.filter((h) => h.kind !== 'teacherSeat'),
    }
    const view = groupView(standIn, helperStaff)
    expect(view.rows[1].cells[view.days.indexOf(TUE)]).toContainEqual({
      text: 'DU: A1 (asszisztens, 10–18)',
      tone: 'substitution',
      staffId: 'a1',
    })
  })

  it('has no helper row in a week without helpers', () => {
    expect(groupView(roster, staff).rows.map((r) => r.label)).not.toContain('Asszisztens, civil')
  })

  it('lists helpers last in the person view, 8–16 as NAP with its own fill', () => {
    const view = personView(helped, helperStaff, [])
    expect(view.rows.map((r) => r.staffId).slice(-3)).toEqual(['a1', 'a2', 'c1'])
    const tue = view.days.indexOf(TUE)
    expect(view.rows.at(-3)!.cells[tue]).toEqual({ text: 'NAP · 1. cs.', fill: 'day' })
    expect(view.rows.at(-1)!.cells[tue]).toEqual({ text: 'NAP · civil', fill: 'day' })
  })
})
```

  Append to `tests/i18n/recalcText.test.ts`, matching how its other cases call `ui.recalc.day`:

```ts
  it('names an asszisztens standing in, with her new hours (v3-c)', () => {
    const was = { staffId: 'a1', date: '2026-10-28', shift: 'day' as const, seat: { kind: 'helper' as const, group: 1 } }
    const now = {
      staffId: 'a1',
      date: '2026-10-28',
      shift: 'afternoon' as const,
      seat: { kind: 'teacher' as const, group: 2, shift: 'afternoon' as const },
      substitution: true as const,
    }
    expect(ui.recalc.day('assistant', was, now, false)).toBe(
      'szerda: DU 10:00–18:00 (eddig NAP), 2. cs., óvónő helyett',
    )
  })
```

  Append inside `describe('highlightedCells', …)` of `tests/ui/helpers.test.ts`:

```ts
  it('points at the helper row, one past the reserve rows (v3-c)', () => {
    const helped: Roster = {
      ...roster,
      assignments: [...roster.assignments, { staffId: 'c1', date: MON, shift: 'day' }],
    }
    const withCivil = makeStaff(1, 1, 0, 1)
    expect([...highlightedCells(helped, withCivil, warning([{ staffId: 'c1', date: MON }]))]).toEqual(
      [`4|${MON}`],
    )
    expect(highlightedCells(helped, withCivil, warning([{ date: MON }])).size).toBe(5)
  })
```

- [ ] **Step 2:** Run the three files. Expected: FAIL.

- [ ] **Step 3: Group view.** In `src/export/views.ts`:
  - imports:
    `import { isHelper, ROLES, SHIFTS, type Absence, type Assignment, type Role, type Roster, type Shift, type Staff } from '../core/types'`,
    `import { resolveNames, rosterOrder } from '../core/names'`, and add `helperShort` to the
    `../i18n/hu` import
  - add above `groupView`:

```ts
/** The row for helpers out of every seat (v3-c): asszisztens extras and civils. */
export const HELPER_ROW = 'Asszisztens, civil'
const HELPER_WORD: Partial<Record<Role, string>> = { assistant: 'Asszisztens', civil: 'Civil' }

/** A week with a helper gets the helper row, so the group view has one more row. */
export function hasHelperRow(roster: Roster, staff: Staff[]): boolean {
  const role = new Map(staff.map((s) => [s.id, s.role]))
  return roster.assignments.some((a) => {
    const r = role.get(a.staffId)
    return r !== undefined && isHelper(r)
  })
}
```

  - in `groupView`, replace the teacher-line mapping (`(['morning', 'afternoon'] as const).map(...)`):

```ts
      const lines: Line[] = SHIFTS.map((shift): Line => {
        const a = today.find(
          (x) => x.seat?.kind === 'teacher' && x.seat.group === g && x.seat.shift === shift,
        )
        if (!a) return { text: `${shiftShort[shift]}: ${HOLE}`, tone: 'hole' }
        if (a.substitution) {
          // An asszisztens's hours don't move on ügyelet: no mark (v3-c).
          return {
            text: `${shiftShort[shift]}: ${name(a.staffId)} (asszisztens, ${helperShort[a.shift]})`,
            tone: 'substitution',
            staffId: a.staffId,
          }
        }
        return {
          text: `${shiftShort[shift]}: ${name(a.staffId)}${a.duty ? dutyMark[shift] : ''}`,
          staffId: a.staffId,
        }
      })
```

  - after the `lines.unshift(...)` duty block, add:

```ts
      const beside = today.find((x) => x.seat?.kind === 'helper' && x.seat.group === g)
      if (beside) {
        lines.push({
          text: `Asszisztens: ${name(beside.staffId)} (${helperShort[beside.shift]})`,
          staffId: beside.staffId,
        })
      }
```

  - replace the `if (nanny?.substitution) { … }` branch:

```ts
      if (nanny?.substitution) {
        const civil = role.get(nanny.staffId) === 'civil'
        lines.push({
          text: civil
            ? `Dajka: ${name(nanny.staffId)} (civil, ${shiftShort[nanny.shift]}${key(nanny)})`
            : `Dajka: ${name(nanny.staffId)} (óvónő, ${shiftShort[nanny.shift]})`,
          tone: 'substitution',
          ...(civil ? bold(nanny) : {}),
          staffId: nanny.staffId,
        })
      } else if (nanny) {
```

  - after the reserve-rows loop, before `return { days, rows }`:

```ts
  if (hasHelperRow(roster, staff)) {
    const order = (a: Assignment) => ROLES.indexOf(role.get(a.staffId) ?? 'teacher')
    rows.push({
      label: HELPER_ROW,
      cells: days.map((date) =>
        on(date)
          .filter((a) => !a.seat && isHelper(role.get(a.staffId) ?? 'teacher'))
          .sort((a, b) => order(a) - order(b) || name(a.staffId).localeCompare(name(b.staffId), 'hu'))
          .map((a) => ({
            text: `${HELPER_WORD[role.get(a.staffId)!]}: ${name(a.staffId)} (${helperShort[a.shift]})`,
            staffId: a.staffId,
          })),
      ),
    })
  }
```

  - update `groupView`'s doc comment: *"…then the reserve teachers and nannies, then (v3-c) the
    helpers out of every seat…"*

- [ ] **Step 4: Person view.** In `personView`:
  - replace the `people` sort with
    `const people = rosterOrder(staff.filter(…same filter…))`
  - change `cellFor` to take `(s: Staff, date: string)` and look up by `s.id`
  - replace its `where` / `extra` lines:

```ts
      const where = a.seat ? groupShort(a.seat.group) : s.role === 'civil' ? 'civil' : 'tartalék'
      const extra = a.substitution
        ? a.seat?.kind === 'teacher'
          ? ' (óvónő helyett)'
          : ' (dajka helyett)'
        : a.opener
          ? ' · nyit'
          : a.closer
            ? ' · zár'
            : ''
```

  - update the call site: `cells: days.map((date) => cellFor(s, date))`
  - doc comment: *"One row per person, in `ROLES` order…"*

- [ ] **Step 5: Highlight.** In `src/ui/highlight.ts`, import `hasHelperRow` from
  `../export/views` and `isHelper` from `../core/types`. Then:
  - add `const rows = groups + 2 + (hasHelperRow(roster, staff) ? 1 : 0)` after `groups`
  - replace the reserve-row expression:

```ts
      const r = role.get(a.staffId)
      const row = a.seat
        ? a.seat.group - 1
        : r === 'teacher'
          ? groups
          : r !== undefined && isHelper(r)
            ? groups + 2
            : groups + 1
```

  - replace `row < groups + 2` with `row < rows`
  - extend the doc comment with *"…then (v3-c) the helper row."*

- [ ] **Step 6: Phone list and legend.** In `src/i18n/hu.ts`, in `ui.recalc.day`, replace
  `if (now.substitution && !was.substitution) parts.push('dajka helyett')` with:

```ts
      if (now.substitution && !was.substitution)
        parts.push(now.seat?.kind === 'teacher' ? 'óvónő helyett' : 'dajka helyett')
```

  Append to `LEGEND`:

```ts
  'Asszisztens, civil: NAP 8:00–16:00; ha valakit helyettesít, DE 6:00–14:00 vagy DU 10:00–18:00.',
```

  In `ui.roster.tableHint`, change *"Narancs = dajka helyett óvónő."* to
  *"Narancs = valaki más helyett (óvónő a dajka, civil a dajka, asszisztens a DU óvónő helyett)."*

- [ ] **Step 7:** Run `npm run typecheck` and `npm test`. Expected: all green. A test asserting
  the full `LEGEND` length or text gets the new line.

- [ ] **Step 8: Commit.**

```bash
git add -A src tests
git commit -m "feat(views): helpers on the wall, the printout and Excel; NAP fill; the phone list names stand-ins"
```

---

### Task 9: Screens — four sections, the shift buttons

**Files:** Modify `src/ui/StaffScreen.tsx`, `src/ui/RosterScreen.tsx`, `src/i18n/hu.ts`. Tests:
`tests/ui/StaffScreen.test.tsx`, `tests/ui/AbsenceScreen.test.tsx`,
`tests/ui/RosterScreen.test.tsx`.

- [ ] **Step 1: Failing tests.**

  In `tests/ui/StaffScreen.test.tsx`, replace the `'→ Dajka'` part of
  `'edits the name in place and moves someone to the other column'`:

```ts
    fireEvent.change(screen.getByLabelText('Munkakör'), { target: { value: 'nanny' } })
```

  Append to its `describe`:

```ts
  it('has four sections, each with its own add button (v3-c)', () => {
    const dispatch = renderScreen(emptyState())
    for (const title of [/Óvónők/, /Dajkák/, /Pedagógiai asszisztensek/, /Civilek/]) {
      expect(screen.getByRole('region', { name: title })).toBeTruthy()
    }
    fireEvent.click(screen.getByText('+ Új asszisztens'))
    expect(dispatch).toHaveBeenCalledWith({ type: 'addStaff', id: expect.any(String), role: 'assistant' })
    fireEvent.click(screen.getByText('+ Új civil'))
    expect(dispatch).toHaveBeenCalledWith({ type: 'addStaff', id: expect.any(String), role: 'civil' })
  })
```

  In `tests/ui/AbsenceScreen.test.tsx`, add a case modelled on the one at line ~72 (the
  `'section'` row headers). With staff that include an asszisztens and a civil, the sections read
  `['Óvónők', 'Dajkák', 'Pedagógiai asszisztensek', 'Civilek']`. The
  `Távol (asszisztens) <date>` cell never has the `short` class.

  Append to `tests/ui/RosterScreen.test.tsx`, after the swap `describe`:

```ts
describe('RosterScreen helper hours (v3-c)', () => {
  const helperState = { ...wedOnly, staff: makeStaff(4, 3, 1) }
  const besideGroup1: Roster = {
    ...valid,
    assignments: [
      ...valid.assignments,
      { staffId: 'a1', date: WED, shift: 'day', seat: { kind: 'helper', group: 1 } },
    ],
  }
  const saved = (r: Roster) =>
    reducer(helperState, {
      type: 'saveRoster',
      week: WEEK,
      roster: r,
      inputKey: inputKey(solveInputFor(helperState, WEEK)),
    })

  it('moves a helper to 6–14 by hand, marks the cell, and undoes it', () => {
    render(<Harness initial={saved(besideGroup1)} />)
    fireEvent.click(screenTable().getByText('Asszisztens: A1 (8–16)'))
    expect(screen.getByText('8–16').closest('button')?.disabled).toBe(true)
    fireEvent.click(screen.getByText('6–14'))
    expect(screenTable().getByText('Asszisztens: A1 (6–14)')).toBeTruthy()
    expect(screen.getByText('A1: 6–14, szerda.')).toBeTruthy()
    expect(document.querySelectorAll('td.changed')).toHaveLength(1)
    expect(screen.getByText('kézzel módosítva')).toBeTruthy()
    fireEvent.click(screen.getByText('↶ Visszavonás'))
    expect(screenTable().getByText('Asszisztens: A1 (8–16)')).toBeTruthy()
  })

  it('offers no hours for a teacher', () => {
    render(<Harness initial={saved(besideGroup1)} />)
    fireEvent.click(screenTable().getByText('DE: T2'))
    expect(screen.queryByText('6–14')).toBeNull()
  })

  it('refuses hours that break her stand-in', () => {
    const standIn: Roster = {
      ...valid,
      assignments: [
        ...valid.assignments,
        {
          staffId: 'a1',
          date: WED,
          shift: 'afternoon',
          seat: { kind: 'teacher', group: 2, shift: 'afternoon' },
          substitution: true,
        },
      ],
      holes: [],
    }
    render(<Harness initial={saved(standIn)} />)
    fireEvent.click(screenTable().getByText('DU: A1 (asszisztens, 10–18)'))
    fireEvent.click(screen.getByText('6–14'))
    expect(
      screen.getByText(
        'Ez a műszak nem lehetséges: asszisztens csak délután, 10–18-ban állhat be óvónő helyett.',
      ),
    ).toBeTruthy()
  })
})
```

- [ ] **Step 2:** Run `npx vitest run tests/ui/StaffScreen.test.tsx tests/ui/AbsenceScreen.test.tsx tests/ui/RosterScreen.test.tsx`.
  Expected: FAIL.

- [ ] **Step 3: Strings.** In `src/i18n/hu.ts`:
  - in `ui.staff`, delete `teacher`, `nanny`, `teachers`, `nannies`, `move` and `moveHint`
    (grep `ui.staff.teacher` first; nothing else should use them)
  - add:

```ts
    roleHint: 'Ha valaki más munkakörbe kerül, itt állítsd át.',
```

  - in `ui.staff.legend`, replace the *"A → Dajka és → Óvónő gombbal…"* line with:

```ts
      'Munkakör: a listából lehet valakit másik munkakörbe tenni. Az asszisztens és a civil nem számít az egyenlő elosztásba.',
```

  - change `ui.staff.empty` to
    `'Még nincs munkatárs. Kattints valamelyik „Új …” gombra.'`; the StaffScreen test matches
    `/Még nincs munkatárs/`, so it still passes
  - replace `SWAP_REASONS` with:

```ts
/** The strict rules a hand edit can break (validate.ts rule names), most telling first. */
const EDIT_REASONS: [rule: string, reason: string][] = [
  ['nannyInTeacherSeat', 'dajka nem ülhet óvónői helyre'],
  ['civilInTeacherSeat', 'civil nem ülhet óvónői helyre'],
  ['assistantNotAfternoon', 'asszisztens csak délután, 10–18-ban állhat be óvónő helyett'],
  ['assistantInNannySeat', 'asszisztens nem ülhet dajka helyére'],
  ['helperSeatNotAssistant', 'a csoport mellé csak asszisztens ülhet'],
  ['groupWithoutTeacher', 'így egy csoportban nem maradna óvónő'],
  ['helperWithoutTeacher', 'asszisztens csak óvónő mellett lehet csoportban'],
  ['standInOnDay', 'dajka helyett csak 6–14 vagy 10–18 lehet'],
  ['dayShiftNotHelper', '8–16 csak asszisztensnek és civilnek van'],
  ['keyNotNanny', 'nyitni és zárni csak dajka tud'],
  ['openerNotMorning', 'aki nyit, annak 6:00-ra kell jönnie'],
  ['closerNotAfternoon', 'aki zár, annak 18:00-ig kell maradnia'],
  ['openerEveryDay', 'így valaki minden nap nyitna'],
  ['closerEveryDay', 'így valaki minden nap zárna'],
]
const refusal = (rules: string[]) =>
  EDIT_REASONS.find(([rule]) => rules.includes(rule))?.[1] ?? 'megszegne egy szabályt'
```

  - in `ui.roster`, replace `swapRefused`, and add after `didSwap`:

```ts
    swapRefused: (rules: string[]) => `Ez a csere nem lehetséges: ${refusal(rules)}.`,
    shiftRefused: (rules: string[]) => `Ez a műszak nem lehetséges: ${refusal(rules)}.`,
    didShift: (name: string, hours: string, date: string) => `${name}: ${hours}, ${dayName(date)}.`,
    shiftHint: 'Másik munkaidő ennek a segítőnek ezen a napon.',
```

  - check that the comment line *"The strict rules a swap can break…"* above `STOPPED_AT` is now
    gone or moved: it belonged to `SWAP_REASONS`

- [ ] **Step 4: Munkatársak.** In `src/ui/StaffScreen.tsx`:
  - import `ROLES` from `../core/types`
  - delete the local `ROLES` and `other`
  - in the header row, replace the two trailing `<th />` with `<th>{ui.staff.role}</th>` and
    `<th />`
  - replace the move-button cell:

```tsx
                  <td>
                    <select
                      aria-label={ui.staff.role}
                      title={ui.staff.roleHint}
                      value={s.role}
                      onChange={(e) => update(s.id, { role: e.target.value as Role })}
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {ui.staff.roles[r]}
                        </option>
                      ))}
                    </select>
                  </td>
```

  - change the screen's doc comment to *"The four roles side by side (two since v3-c's helpers);
    deleted people stay hidden."*

  `.staff-columns` is a wrapping flex row, so four columns wrap two by two with no CSS change.
  Check it in the browser in Task 10.

- [ ] **Step 5: The hours buttons.** In `src/ui/RosterScreen.tsx`:
  - imports:
    `import { editRoster, editShift, type ShiftChange, type Swap } from '../core/edit'`,
    `import { HELPER_SHIFTS, isHelper, type Anchor, type Warning } from '../core/types'`, and
    `helperShort` from `../i18n/hu`
  - replace `swap` with a shared `applyEdit`, `swap` and `changeShift`:

```ts
  // A hand edit that passed the gate: save it, as one undo step with its cells marked.
  const applyEdit = (edited: Roster, label: string) => {
    if (!roster) return
    dispatch({ type: 'saveRoster', week, roster: edited, inputKey: inputKey(input) })
    history.record({
      week,
      label,
      undo: [{ type: 'restoreRoster', week, roster, inputKey: period.rosterInputKey }],
      changed: [...changedCells(roster, edited, state.staff, period.groupLabels)],
    })
  }

  const swap = (change: Swap) => {
    if (!roster) return
    const result = editRoster(input, roster, change, from)
    if (!result.ok) return setSwapError(ui.roster.swapRefused(result.violations.map((v) => v.rule)))
    applyEdit(result.roster, ui.roster.didSwap(nameOf(change.a), nameOf(change.b), change.date))
  }

  // A helper's hours by hand (v3-c): 8–16, 6–14 or 10–18.
  const changeShift = (change: ShiftChange) => {
    setPicked(undefined)
    if (!roster) return
    const result = editShift(input, roster, change, from)
    if (!result.ok) return setSwapError(ui.roster.shiftRefused(result.violations.map((v) => v.rule)))
    applyEdit(
      result.roster,
      ui.roster.didShift(nameOf(change.staffId), helperShort[change.shift], change.date),
    )
  }
```

    Add `type Roster` to the `../core/types` import for `applyEdit`.
  - beside `nameOf`, add:

```ts
  // The picked person's day, when she is a helper: her hours can change by hand (v3-c).
  const pickedRole = picked && state.staff.find((s) => s.id === picked.staffId)?.role
  const pickedHelper =
    picked && pickedRole && isHelper(pickedRole)
      ? roster?.assignments.find((a) => a.staffId === picked.staffId && a.date === picked.date)
      : undefined
```

  - in the `{picked && ( … )}` swap-bar, after the `<span>`, add:

```tsx
            {pickedHelper &&
              HELPER_SHIFTS.map((shift) => (
                <button
                  key={shift}
                  title={ui.roster.shiftHint}
                  aria-pressed={pickedHelper.shift === shift}
                  disabled={pickedHelper.shift === shift || solving}
                  onClick={() => changeShift({ ...picked, shift })}
                >
                  {helperShort[shift]}
                </button>
              ))}
```

- [ ] **Step 6:** Run `npm run typecheck` and `npm test`. Expected: all green.

- [ ] **Step 7: Commit.**

```bash
git add -A src tests
git commit -m "feat(ui): four staff sections, a Munkakör list, and a helper's hours by hand"
```

---

### Task 10: Properties, demo, docs, verification, PR

**Files:** Modify `tests/core/fixtures.ts`, `tests/core/properties.test.ts`,
`src/demo/demoData.ts`, `README.md`, `docs/spec.md`.

- [ ] **Step 1: Random helpers.** Append to `tests/core/fixtures.ts`:

```ts
/** randomInput(seed) plus 0–2 asszisztens and 0–2 civils, from their own stream (v3-c). */
export function randomHelperInput(seed: number): SolveInput {
  const input = randomInput(seed)
  const random = seededRandom(seed + 10_000)
  const int = (lo: number, hi: number) => lo + Math.floor(random() * (hi - lo + 1))
  const helpers = makeStaff(0, 0, int(0, 2), int(0, 2))
  const days = input.period.days
  return {
    ...input,
    staff: [...input.staff, ...helpers],
    absences: [
      ...input.absences,
      ...helpers.flatMap((s) =>
        days
          .filter(() => random() < 0.2)
          .map((date) => ({ staffId: s.id, date, kind: 'leave' as const })),
      ),
    ],
  }
}
```

- [ ] **Step 2: Property runs with helpers.** In `tests/core/properties.test.ts`:
  - import `randomHelperInput`, and `type SolveInput`
  - move the body of the `it` into a function `check(input: SolveInput)`, and call it from the
    existing loop with `randomInput(seed)`
  - leave `enoughStaff` as it is: teachers and nannies alone still guarantee zero holes, since
    helpers only add
  - append a second loop:

```ts
describe('every random period with helpers (v3-c)', () => {
  for (let seed = 1; seed <= RUNS; seed++) {
    it(`seed ${seed}`, () => check(randomHelperInput(seed)), 300_000)
  }
})
```

  Run `npx vitest run tests/core/properties.test.ts`. Expected: PASS. A failing seed is a real
  disagreement between `expectedHoles` and the solver. Debug it with
  `superpowers:systematic-debugging`: print the day's capacity and the roster's holes. Never
  loosen the assertion.

- [ ] **Step 3: Demo.** In `src/demo/demoData.ts`, add after `NANNIES`:

```ts
const ASSISTANTS = ['Rácz Réka']
const CIVILS = ['Szabó Sára']
```

  Make the staff
  `[...people(TEACHERS, 'teacher'), ...people(NANNIES, 'nanny'), ...people(ASSISTANTS, 'assistant'), ...people(CIVILS, 'civil')]`,
  and update the doc comment to *"A kindergarten of 18 (one asszisztens, one civil)…"*. Run
  `npx vitest run tests/demo tests/core/recalc.test.ts`. Expected: PASS. The demo still solves
  without holes.

- [ ] **Step 4: Her real weeks.** Run:

```bash
npx tsx scripts/time-weeks.ts data/ovoda-mentes-2026-10-17.json
npx tsx scripts/time-weeks.ts data/ovoda-mentes-2026-09-27.json
npx vitest run tests/scripts/golden.test.ts
```

  Expected for every week: `valid`, no `stoppedEarly`, and stage times close to v3-b's. Her
  backups have no helpers, so the golden roster should not move. If it does, compare the two:
  - Explainable by the weight change: report it.
  - Anything else: a regression to fix.

- [ ] **Step 5: Try it in the browser.** Run `npm run dev` and use the `run` skill (or Claude in
  Chrome) on the demo:
  - Munkatársak shows four sections wrapping two by two.
  - Számol places Réka beside a group on 8–16.
  - Clicking Réka offers 8–16 / 6–14 / 10–18, and 6–14 marks the cell.
  - Print preview shows the helper row and the NAP fill.

  Screenshot each.

- [ ] **Step 6: Docs.**
  - `docs/spec.md` §2 *Her rules*: add *"Helper roles — pedagógiai asszisztens and civil —
    arrived in v3-c (`docs/specs/2026-10-17-v3-c-helper-roles-design.md`)."* §6.5: add `helpers`
    to the stage list after the keep* stages.
  - `README.md`, in its voice:
    - *Munkatársak*: four roles, and the Munkakör list.
    - *Beosztás*: the asszisztens beside a group on 8–16, or 10–18 for a missing DU teacher; the
      civil on 8–16, or 6–14 / 10–18 for a missing nanny, before any teacher; her hours by hand.
    - *How it works*: the stage order and the helpers' place outside fairness.

- [ ] **Step 7: Verify everything.**

```bash
npx prettier --write src tests scripts README.md docs
npm test && npm run typecheck && npm run format:check && npm run build
PROPERTY_RUNS=100 npx vitest run tests/core/properties.test.ts tests/core/edit.test.ts
```

  Expected: all green.

- [ ] **Step 8: Commit and PR — do not merge.**

```bash
git add -A src tests README.md docs
git commit -m "docs: v3-c helper roles in the README and spec; demo gains an asszisztens and a civil; property runs with helpers"
git push -u origin v3-c-helpers
gh pr create --title "v3-c: pedagógiai asszisztens and civil" --body "<summary + the Decisions list from this plan>"
```

  Merging deploys to her. **Stop here and ask the user before merging.**
