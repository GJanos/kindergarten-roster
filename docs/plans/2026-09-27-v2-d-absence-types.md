# v2-D — Richer absences — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Absences have a kind — szabadság, beteg, egyéb — painted with a picker in the month grid, printed by name, and used to order call-in suggestions; people with a yearly leave allowance show how much of it is used, with typed-in carry-over.

**Architecture:** `Absence` gains a required `kind` (`'leave' | 'sick' | 'other'`); the schema goes from 1 to 2, and the migration types every v1 absence as leave. The solver ignores the kind (absent is absent), and so does the input fingerprint. `Staff` gains optional `leaveAllowance` (days per calendar year) and `leaveCarry` (days per year). The month grid paints with a chosen kind and shows the leave balance per person.

**Tech Stack:** TypeScript, React 19, vitest 5 with jsdom.

---

## Before you start

- **Prerequisites:** v2-A, v2-B and v2-C are done.
- Design: `docs/specs/2026-09-27-v2-design.md`, section D. Spec: `docs/spec.md` §8.1, §8.2, §9.
- **Words used here.** An absence's *kind* is its type; the field is called `kind` because `type` already tags every action. The *leave year* is the calendar year (Hungarian leave is counted per calendar year); the roster balance of v2-C keeps using the kindergarten year.
- Conventions as in the v1 plans. After Task 1 the whole suite must be green again before anything else changes.

## File structure

```text
src/core/types.ts            AbsenceKind; Absence.kind; Staff.leaveAllowance, Staff.leaveCarry
src/state/appState.ts        SCHEMA_VERSION 2; setAbsent carries a kind
src/state/migrate.ts         fromV1; kind and leave fields validated
src/state/leave.ts           NEW  leaveBalance(absences, staff, year)
src/core/explain.ts          "Hívj be valakit" lists leave first, the sick last
src/ui/warningDays.ts        call-ins ordered by kind; the sick marked
src/ui/WarningsPanel.tsx     "(beteg)" on a sick person's button
src/ui/RosterScreen.tsx      undoing a call-in restores the absence's kind
src/export/views.ts          person view says szabadság / beteg / távol
src/i18n/hu.ts               kinds, letters, balance and allowance texts; ABSENCE_WORD
src/ui/StaffScreen.tsx       "Szabadság/év" column
src/ui/AbsenceScreen.tsx     kind picker, paint/clear, bars per kind, balance, carry-over editor
src/demo/demoData.ts · scripts/slice-input.ts · tests/core/fixtures.ts   absences get a kind
src/app/app.css              picker, bar colours and letters, balance
tests/…                      migrate, appState, warningDays, explain, views, StaffScreen, AbsenceScreen, RosterScreen, slice-input
docs/spec.md
```

---

### Task 1: Absence kinds and schema 2

**Files:**
- Modify: `src/core/types.ts`, `src/state/appState.ts`, `src/state/migrate.ts`
- Modify: `tests/core/fixtures.ts`, `scripts/slice-input.ts`, `src/demo/demoData.ts`
- Test: `tests/state/migrate.test.ts`, `tests/scripts/slice-input.test.ts`

- [ ] **Step 1: Write the failing migration tests**

Replace the body of `tests/state/migrate.test.ts` with:

```ts
import { describe, expect, it } from 'vitest'
import { emptyState } from '../../src/state/appState'
import { InvalidDataError, migrate } from '../../src/state/migrate'

describe('migrate', () => {
  it('accepts current data unchanged', () => {
    const state = {
      ...emptyState(),
      staff: [
        { id: 'a', fullName: 'A', displayName: 'A', role: 'nanny', active: true },
        { id: 'b', fullName: 'B', displayName: 'B', role: 'teacher', active: false, deleted: true },
        {
          id: 'c',
          fullName: 'C',
          displayName: 'C',
          role: 'teacher',
          active: true,
          leaveAllowance: 50,
          leaveCarry: { '2026': 4 },
        },
      ],
      absences: [
        { staffId: 'a', date: '2026-10-26', kind: 'leave' },
        { staffId: 'c', date: '2026-10-27', kind: 'sick' },
      ],
    }
    expect(migrate(structuredClone(state))).toEqual(state)
  })

  it('brings v1 data to v2, every absence as leave', () => {
    const v1 = {
      schemaVersion: 1,
      staff: [],
      absences: [{ staffId: 'a', date: '2026-10-26' }],
      periods: {},
    }
    expect(migrate(v1)).toEqual({
      schemaVersion: 2,
      staff: [],
      absences: [{ staffId: 'a', date: '2026-10-26', kind: 'leave' }],
      periods: {},
    })
  })

  const staffWith = (extra: object) => ({
    ...emptyState(),
    staff: [{ id: 'a', fullName: 'A', displayName: 'A', role: 'nanny', active: true, ...extra }],
  })

  it.each([
    ['not an object', 'hello'],
    ['an unknown version', { ...emptyState(), schemaVersion: 99 }],
    ['broken staff', { ...emptyState(), staff: [{ id: 1 }] }],
    ['a broken deleted flag', staffWith({ active: false, deleted: 'yes' })],
    ['a negative leave allowance', staffWith({ leaveAllowance: -1 })],
    ['a broken carry-over', staffWith({ leaveCarry: { '2026': 'sok' } })],
    ['broken absences', { ...emptyState(), absences: 'none' }],
    [
      'an absence of an unknown kind',
      { ...emptyState(), absences: [{ staffId: 'a', date: '2026-10-26', kind: 'vacation' }] },
    ],
    ['no periods', { ...emptyState(), periods: [] }],
  ])('rejects %s', (_, raw) => {
    expect(() => migrate(raw)).toThrow(InvalidDataError)
  })
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/state/migrate.test.ts`
Expected: several failures — v1 data is rejected as an unknown version, the new fields aren't checked.

- [ ] **Step 3: Types**

In `src/core/types.ts`:

```ts
export type AbsenceKind = 'leave' | 'sick' | 'other' // szabadság, beteg, egyéb
export type Absence = { staffId: string; date: string; kind: AbsenceKind } // one row per absent day
```

(replacing the old `Absence` line), and add to `Staff` after `deleted?: true …`:

```ts
  leaveAllowance?: number // leave days per calendar year; absent = not tracked (v2)
  leaveCarry?: Record<string, number> // days carried into a calendar year ('2026' → 3), typed by her
```

- [ ] **Step 4: Schema version and migration**

In `src/state/appState.ts`, `export const SCHEMA_VERSION = 1` → `export const SCHEMA_VERSION = 2`.

In `src/state/migrate.ts`, replace everything from `const isStaff =` to the end of the file with:

```ts
const isCount = (value: unknown) =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0

const isStaff = (value: unknown) =>
  isObject(value) &&
  typeof value.id === 'string' &&
  typeof value.fullName === 'string' &&
  typeof value.displayName === 'string' &&
  (value.role === 'teacher' || value.role === 'nanny') &&
  typeof value.active === 'boolean' &&
  (value.deleted === undefined || value.deleted === true) &&
  (value.leaveAllowance === undefined || isCount(value.leaveAllowance)) &&
  (value.leaveCarry === undefined ||
    (isObject(value.leaveCarry) && Object.values(value.leaveCarry).every(isCount)))

const KINDS: readonly unknown[] = ['leave', 'sick', 'other']

const isAbsence = (value: unknown) =>
  isObject(value) &&
  typeof value.staffId === 'string' &&
  typeof value.date === 'string' &&
  KINDS.includes(value.kind)

/** v1 → v2: absences get a kind. v1 only planned break weeks, where an absence is leave. */
function fromV1(data: Json): Json {
  const absences = Array.isArray(data.absences)
    ? data.absences.map((a: unknown) => (isObject(a) ? { ...a, kind: 'leave' } : a))
    : data.absences
  return { ...data, schemaVersion: 2, absences }
}

/**
 * Brings saved or backed-up data up to the current schema. Runs on every load and
 * every restore, so old backups open in any newer version.
 */
export function migrate(raw: unknown): AppState {
  if (!isObject(raw)) throw new InvalidDataError('not an object')
  let data = raw
  if (data.schemaVersion === 1) data = fromV1(data)
  if (data.schemaVersion !== SCHEMA_VERSION) {
    throw new InvalidDataError(`unknown schema version ${String(data.schemaVersion)}`)
  }
  if (!Array.isArray(data.staff) || !data.staff.every(isStaff)) throw new InvalidDataError('staff')
  if (!Array.isArray(data.absences) || !data.absences.every(isAbsence))
    throw new InvalidDataError('absences')
  if (!isObject(data.periods)) throw new InvalidDataError('periods')
  return data as AppState
}
```

- [ ] **Step 5: Everything that builds absences gives a kind**

`tests/core/fixtures.ts`, in `makeInput`: `dates.map((date) => ({ staffId, date })),` → `dates.map((date) => ({ staffId, date, kind: 'leave' as const })),`, and in `randomInput`: `days.filter(() => random() < absenceRate).map((date) => ({ staffId: s.id, date })),` → `….map((date) => ({ staffId: s.id, date, kind: 'leave' as const })),`.

`scripts/slice-input.ts`: `return { staffId, date }` → `return { staffId, date, kind: 'leave' as const }`. In `tests/scripts/slice-input.test.ts`, the expected `absences: [{ staffId: 's2', date: '2026-08-24' }],` becomes `absences: [{ staffId: 's2', date: '2026-08-24', kind: 'leave' }],`.

`src/demo/demoData.ts`: change `away` to take a kind, and make one absence sick so the demo shows both:

```ts
  const away = (staffId: string, dates: string[], kind: Absence['kind'] = 'leave'): Absence[] =>
    dates.map((date) => ({ staffId, date, kind }))
```

and `...away('demo-teacher-7', days.slice(-1)),` → `...away('demo-teacher-7', days.slice(-1), 'sick'),`.

- [ ] **Step 6: Run everything**

Run: `npx tsc --noEmit && npx vitest run`
Expected: `tsc` reports errors only in `src/state/appState.ts` (the `setAbsent` case builds absences without a kind). Fix it now — Task 2 tests it properly — by changing the `added` line to

```ts
      const added = action.absent
        ? [...dates].map((date) => ({ staffId: action.staffId, date, kind: 'leave' as const }))
        : []
```

then re-run: no type errors. `tests/state/appState.test.ts` > `'marks and clears days without duplicates'` fails because the cleared absence now carries `kind: 'leave'`; change its expectation to `[{ staffId: 'a', date: '2026-10-27', kind: 'leave' }]`. Everything else passes.

- [ ] **Step 7: Commit**

```bash
git add src/core/types.ts src/state/appState.ts src/state/migrate.ts src/demo/demoData.ts scripts/slice-input.ts tests
git commit -m "feat(state): schema 2 — absences have a kind, staff a leave allowance"
```

---

### Task 2: Setting an absence sets its kind

**Files:**
- Modify: `src/state/appState.ts` (`Action`, `setAbsent`)
- Modify: `src/ui/RosterScreen.tsx` (`fix`)
- Test: `tests/state/appState.test.ts`, `tests/ui/RosterScreen.test.tsx`

- [ ] **Step 1: Write the failing tests**

In `tests/state/appState.test.ts`, inside `describe('absences', …)`:

```ts
  it('marks a day with a kind, replacing another kind on the same day', () => {
    const state = run(
      withAnna(),
      { type: 'setAbsent', staffId: 'a', dates: ['2026-10-26'], absent: true, kind: 'leave' },
      { type: 'setAbsent', staffId: 'a', dates: ['2026-10-26'], absent: true, kind: 'sick' },
    )
    expect(state.absences).toEqual([{ staffId: 'a', date: '2026-10-26', kind: 'sick' }])
  })
```

In `tests/ui/RosterScreen.test.tsx`, inside `describe('RosterScreen undo', …)`:

```ts
  it('puts a sick day back as sick when a call-in is undone', async () => {
    vi.mocked(solveInWorker).mockResolvedValue(fixed)
    const away = reducer(base, {
      type: 'setAbsent',
      staffId: 't4',
      dates: [WED],
      absent: true,
      kind: 'sick',
    })
    render(<Harness initial={withRoster(away)} />)
    fireEvent.click(screen.getByText('T4 mégis jön (beteg)'))
    expect(await screen.findByText('T4 mégis jön szerdán.')).toBeTruthy()
    fireEvent.click(screen.getByText('↶ Visszavonás'))
    expect(screen.getByText('T4 mégis jön (beteg)')).toBeTruthy()
  })
```

(The `(beteg)` label comes in Task 3; this test goes green there.)

- [ ] **Step 2: Run the state test to see it fail**

Run: `npx vitest run tests/state/appState.test.ts`
Expected: FAIL — `setAbsent` has no `kind`, so the second action lands as `leave`. (`tsc` also rejects the `kind` property.)

- [ ] **Step 3: Implement**

In `src/state/appState.ts`:

- import `AbsenceKind` alongside the other core types;
- the action becomes `| { type: 'setAbsent'; staffId: string; dates: string[]; absent: boolean; kind?: AbsenceKind }`;
- the `added` line becomes

```ts
      const added = action.absent
        ? [...dates].map((date) => ({ staffId: action.staffId, date, kind: action.kind ?? 'leave' }))
        : []
```

In `src/ui/RosterScreen.tsx`, in `fix`, the call-in branch becomes:

```ts
      const { staffId } = dayFix
      // Undo puts the absence back as it was: leave stays leave, sick stays sick.
      const kind = state.absences.find((a) => a.staffId === staffId && a.date === date)?.kind
      action = { type: 'setAbsent', staffId, dates: [date], absent: false }
      inverse = { type: 'setAbsent', staffId, dates: [date], absent: true, kind }
```

- [ ] **Step 4: Run and commit**

Run: `npx tsc --noEmit && npx vitest run tests/state`
Expected: PASS.

```bash
git add src/state/appState.ts src/ui/RosterScreen.tsx tests/state/appState.test.ts tests/ui/RosterScreen.test.tsx
git commit -m "feat(state): setAbsent sets a kind; undoing a call-in restores it"
```

---

### Task 3: Call-ins prefer people on leave

**Files:**
- Modify: `src/ui/warningDays.ts` (`DayFix`, `callIns`), `src/ui/WarningsPanel.tsx`, `src/core/explain.ts`, `src/i18n/hu.ts` (`ui.roster.callIn`)
- Test: `tests/ui/warningDays.test.ts`, `tests/core/explain.test.ts`

- [ ] **Step 1: Write the failing tests**

In `tests/ui/warningDays.test.ts`, inside `describe('warningDays', …)`:

```ts
  it('offers people on leave first, then other absences, and the sick last, marked', () => {
    const away = makeInput({
      teachers: 6,
      nannies: 2,
      groups: 3,
      absent: { t4: [MON], t5: [MON], t6: [MON] },
    })
    const kinds = { t4: 'sick', t5: 'other', t6: 'leave' } as const
    away.absences = away.absences.map((a) => ({ ...a, kind: kinds[a.staffId as keyof typeof kinds] }))
    const { days } = warningDays(
      [seat(MON, 'Hétfő, 1. cs.: nincs délutános óvónő (10:30–17:00).')],
      away,
    )
    expect(days[0].fixes).toEqual([
      { kind: 'callIn', date: MON, staffId: 't6', name: 'T6' },
      { kind: 'callIn', date: MON, staffId: 't5', name: 'T5' },
      { kind: 'callIn', date: MON, staffId: 't4', name: 'T4', sick: true },
    ])
  })
```

In `tests/core/explain.test.ts`, inside `describe('explain — day level', …)`:

```ts
  it('lists people on leave before the sick when asking to call someone in', () => {
    const input = makeInput({
      teachers: 2,
      nannies: 2,
      groups: 1,
      days: [WED],
      absent: { t1: [WED], t2: [WED] },
    })
    input.absences = input.absences.map((a) => (a.staffId === 't1' ? { ...a, kind: 'sick' } : a))
    const [warning] = warningsFor(input)
    expect(warning.action).toBe('Hívj be valakit: T2, T1 (távol).')
  })
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/ui/warningDays.test.ts tests/core/explain.test.ts`
Expected: 2 failed — staff order instead of kind order, no `sick` flag.

- [ ] **Step 3: Implement**

In `src/i18n/hu.ts`, `callIn: (name: string) => \`${name} mégis jön\`,` becomes

```ts
    callIn: (name: string, sick?: boolean) => `${name} mégis jön${sick ? ' (beteg)' : ''}`,
```

and add, above `export const ui = {`:

```ts
/** Who to ask first when someone must come in: people on leave, then other absences, the sick last. */
export const CALL_IN_ORDER: Record<AbsenceKind, number> = { leave: 0, other: 1, sick: 2 }
```

with `AbsenceKind` added to the `../core/types` import at the top of the file.

In `src/ui/warningDays.ts`:

1. `DayFix`'s call-in member becomes `| { kind: 'callIn'; date: string; staffId: string; name: string; sick?: true }`.
2. Add `CALL_IN_ORDER` to the `../i18n/hu` import.
3. Replace the last three statements of `callIns` (from `const away = …` to the end) with:

```ts
  const kindOf = new Map(input.absences.filter((a) => a.date === date).map((a) => [a.staffId, a.kind]))
  return input.staff
    .filter((s) => s.active && kindOf.has(s.id) && helps[s.role])
    .sort((a, b) => CALL_IN_ORDER[kindOf.get(a.id)!] - CALL_IN_ORDER[kindOf.get(b.id)!])
    .map((s) => ({
      kind: 'callIn' as const,
      date,
      staffId: s.id,
      name: s.displayName,
      ...(kindOf.get(s.id) === 'sick' ? { sick: true as const } : {}),
    }))
```

In `src/ui/WarningsPanel.tsx`, the call-in button's label `{ui.roster.callIn(fix.name)}` becomes `{ui.roster.callIn(fix.name, fix.sick)}`.

In `src/core/explain.ts`, add `import { CALL_IN_ORDER } from '../i18n/hu'` (merge into the existing `../i18n/hu` import), and in the `NO_TEACHER` branch insert a sort before the `.map`:

```ts
        .sort((a, b) => CALL_IN_ORDER[a.kind] - CALL_IN_ORDER[b.kind])
        .map((a) => name(a.staffId))
```

- [ ] **Step 4: Run and commit**

Run: `npx tsc --noEmit && npx vitest run`
Expected: all pass, including Task 2's `puts a sick day back as sick` test.

```bash
git add src/i18n/hu.ts src/ui/warningDays.ts src/ui/WarningsPanel.tsx src/core/explain.ts tests/ui/warningDays.test.ts tests/core/explain.test.ts
git commit -m "feat: call-in suggestions prefer people on leave; the sick are marked"
```

---

### Task 4: The printout names the kind

**Files:**
- Modify: `src/export/views.ts` (`personView`), `src/i18n/hu.ts`
- Test: `tests/export/views.test.ts`

- [ ] **Step 1: Write the failing test**

In `tests/export/views.test.ts`, change `personView(roster, staff, [{ staffId: 'n2', date: MON }])` to `personView(roster, staff, [{ staffId: 'n2', date: MON, kind: 'other' }])` (the expected `'távol'` stays), and add inside `describe('personView', …)`:

```ts
  it('says szabadság or beteg for those kinds', () => {
    // n2 is off on Monday in the fixture roster (and works on Tuesday).
    const on = (kind: 'leave' | 'sick') =>
      personView(roster, staff, [{ staffId: 'n2', date: MON, kind }]).rows[4].cells[0]
    expect(on('leave')).toEqual({ text: 'szabadság', fill: 'absent' })
    expect(on('sick')).toEqual({ text: 'beteg', fill: 'absent' })
  })
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/export/views.test.ts`
Expected: FAIL — `'távol'` instead of `'szabadság'`.

- [ ] **Step 3: Implement**

In `src/i18n/hu.ts`, add below `export const HOLE = 'BETÖLTETLEN'`:

```ts
/** An absence as the printout and Excel name it. */
export const ABSENCE_WORD: Record<AbsenceKind, string> = {
  leave: 'szabadság',
  sick: 'beteg',
  other: 'távol',
}
```

In `src/export/views.ts`, add `ABSENCE_WORD` to the `../i18n/hu` import, and in `personView` replace

```ts
  const absent = new Set(absences.map((a) => `${a.staffId}|${a.date}`))
```

with

```ts
  const absent = new Map(absences.map((a) => [`${a.staffId}|${a.date}`, a.kind]))
```

and

```ts
    if (absent.has(`${staffId}|${date}`)) return { text: 'távol', fill: 'absent' }
```

with

```ts
    const kind = absent.get(`${staffId}|${date}`)
    if (kind) return { text: ABSENCE_WORD[kind], fill: 'absent' }
```

(`absent.has(…)` in the `people` filter works unchanged on the `Map`.)

- [ ] **Step 4: Run and commit**

Run: `npx vitest run tests/export tests/ui`
Expected: PASS.

```bash
git add src/export/views.ts src/i18n/hu.ts tests/export/views.test.ts
git commit -m "feat(export): the printout says szabadság, beteg or távol"
```

---

### Task 5: Leave allowance and balance

**Files:**
- Create: `src/state/leave.ts`
- Modify: `src/ui/StaffScreen.tsx`, `src/i18n/hu.ts`
- Test: `tests/state/leave.test.ts`, `tests/ui/StaffScreen.test.tsx`

- [ ] **Step 1: Write the failing tests**

`tests/state/leave.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { Absence, Staff } from '../../src/core/types'
import { leaveBalance } from '../../src/state/leave'

const anna: Staff = {
  id: 'a',
  fullName: 'Kiss Anna',
  displayName: 'Anna',
  role: 'teacher',
  active: true,
  leaveAllowance: 50,
  leaveCarry: { '2026': 3 },
}
const absences: Absence[] = [
  { staffId: 'a', date: '2025-12-30', kind: 'leave' }, // last year
  { staffId: 'a', date: '2026-10-26', kind: 'leave' },
  { staffId: 'a', date: '2026-10-27', kind: 'leave' },
  { staffId: 'a', date: '2026-10-28', kind: 'sick' }, // not leave
  { staffId: 'b', date: '2026-10-26', kind: 'leave' }, // someone else
]

describe('leaveBalance', () => {
  it("counts the calendar year's leave days against allowance plus carry-over", () => {
    expect(leaveBalance(absences, anna, '2026')).toEqual({ used: 2, total: 53 })
    expect(leaveBalance(absences, anna, '2025')).toEqual({ used: 1, total: 50 })
  })
})
```

In `tests/ui/StaffScreen.test.tsx`, inside `describe('StaffScreen', …)`:

```ts
  it('sets a yearly leave allowance, empty for none', () => {
    const dispatch = renderScreen(run(...person('a', 'Kiss Anna')))
    const allowance = screen.getByLabelText('Szabadság/év')
    fireEvent.change(allowance, { target: { value: '50' } })
    expect(dispatch).toHaveBeenLastCalledWith({
      type: 'updateStaff',
      id: 'a',
      patch: { leaveAllowance: 50 },
    })
    fireEvent.change(allowance, { target: { value: '' } })
    expect(dispatch).toHaveBeenLastCalledWith({
      type: 'updateStaff',
      id: 'a',
      patch: { leaveAllowance: undefined },
    })
  })
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/state/leave.test.ts tests/ui/StaffScreen.test.tsx`
Expected: FAIL — no `src/state/leave`; no `Szabadság/év` field.

- [ ] **Step 3: `leaveBalance`**

`src/state/leave.ts`:

```ts
import type { Absence, Staff } from '../core/types'

/**
 * Leave days taken in a calendar year (Hungarian leave is counted per calendar year) against the
 * yearly allowance plus the days she typed in as carried over into that year.
 */
export function leaveBalance(
  absences: Absence[],
  person: Staff,
  year: string,
): { used: number; total: number } {
  const used = absences.filter(
    (a) => a.staffId === person.id && a.kind === 'leave' && a.date.startsWith(`${year}-`),
  ).length
  return { used, total: (person.leaveAllowance ?? 0) + (person.leaveCarry?.[year] ?? 0) }
}
```

- [ ] **Step 4: Texts**

In `src/i18n/hu.ts`, inside `ui.staff`:

```ts
    leaveAllowance: 'Szabadság/év',
    leaveAllowanceHint:
      'Éves szabadságkeret napokban. Üresen hagyva nem követjük. A Távollétek fülön látszik, ' +
      'mennyi fogyott el belőle.',
```

and append to `ui.staff.legend` the line:

```ts
      'Szabadság/év: ha megadod, a Távollétek fülön látszik, mennyi fogyott el a keretből.',
```

- [ ] **Step 5: The column**

In `src/ui/StaffScreen.tsx`, in `StaffColumn`'s header row, add after the *Aktív* header cell:

```tsx
              <th>
                {ui.staff.leaveAllowance} <Info text={ui.staff.leaveAllowanceHint} />
              </th>
```

and in each row, after the *Aktív* cell:

```tsx
                  <td>
                    <input
                      type="number"
                      min={0}
                      className="allowance"
                      aria-label={ui.staff.leaveAllowance}
                      value={s.leaveAllowance ?? ''}
                      onChange={(e) =>
                        update(s.id, {
                          leaveAllowance:
                            e.target.value === ''
                              ? undefined
                              : Math.max(0, Math.round(Number(e.target.value))),
                        })
                      }
                    />
                  </td>
```

- [ ] **Step 6: Run and commit**

Run: `npx tsc --noEmit && npx vitest run tests/state tests/ui`
Expected: PASS.

```bash
git add src/state/leave.ts src/ui/StaffScreen.tsx src/i18n/hu.ts tests/state/leave.test.ts tests/ui/StaffScreen.test.tsx
git commit -m "feat: yearly leave allowance per person"
```

---

### Task 6: The month grid paints kinds and shows the balance

**Files:**
- Modify: `src/ui/AbsenceScreen.tsx` (rewritten below), `src/i18n/hu.ts`
- Test: `tests/ui/AbsenceScreen.test.tsx`

- [ ] **Step 1: Update the old expectations and write the new tests**

In `tests/ui/AbsenceScreen.test.tsx`:

1. In `'marks a day, and a stretch by dragging along the row'`, both expected actions gain `kind: 'leave'`:

```ts
      { type: 'setAbsent', staffId: 'a', dates: ['2026-10-26'], absent: true, kind: 'leave' },
      { type: 'setAbsent', staffId: 'a', dates: ['2026-10-27'], absent: true, kind: 'leave' },
```

2. In `'draws a run of absent days as one bar, broken by the weekend'`, the classes gain the kind:

```ts
    expect(cell('2026-10-22')).toBe('absent leave') // Thursday; Friday is a holiday
    expect(cell('2026-10-26')).toBe('absent leave join-right')
    expect(cell('2026-10-27')).toBe('absent leave join-left join-right')
    expect(cell('2026-10-28')).toBe('absent leave join-left')
```

3. Append:

```ts
describe('AbsenceScreen kinds', () => {
  const on = (kind: 'leave' | 'sick' | 'other', date: string): Action => ({
    type: 'setAbsent',
    staffId: 'a',
    dates: [date],
    absent: true,
    kind,
  })

  it('paints the chosen kind', () => {
    const dispatch = vi.fn<(action: Action) => void>()
    render(<AbsenceScreen state={state} dispatch={dispatch} />)
    fireEvent.click(screen.getByText('Beteg'))
    fireEvent.pointerDown(screen.getByLabelText('Anna 2026-10-26'))
    expect(dispatch).toHaveBeenCalledWith(on('sick', '2026-10-26'))
  })

  it('clears a day of the chosen kind, and repaints a day of another kind', () => {
    const away = reducer(state, on('leave', '2026-10-26'))
    const dispatch = vi.fn<(action: Action) => void>()
    render(<AbsenceScreen state={away} dispatch={dispatch} />)
    fireEvent.pointerDown(screen.getByLabelText('Anna 2026-10-26'))
    expect(dispatch).toHaveBeenLastCalledWith({
      type: 'setAbsent',
      staffId: 'a',
      dates: ['2026-10-26'],
      absent: false,
    })
    fireEvent.pointerUp(window)
    fireEvent.click(screen.getByText('Beteg'))
    fireEvent.pointerDown(screen.getByLabelText('Anna 2026-10-26'))
    expect(dispatch).toHaveBeenLastCalledWith(on('sick', '2026-10-26'))
  })

  it('draws each kind as its own bar, joined only with the same kind, lettered once', () => {
    const away = [on('leave', '2026-10-26'), on('leave', '2026-10-27'), on('sick', '2026-10-28')]
      .reduce(reducer, state)
    render(<AbsenceScreen state={away} dispatch={vi.fn()} />)
    const cell = (date: string) => screen.getByLabelText(`Anna ${date}`)
    expect(cell('2026-10-26').className).toBe('absent leave join-right')
    expect(cell('2026-10-27').className).toBe('absent leave join-left')
    expect(cell('2026-10-28').className).toBe('absent sick')
    expect(cell('2026-10-26').textContent).toBe('Sz')
    expect(cell('2026-10-27').textContent).toBe('')
    expect(cell('2026-10-28').textContent).toBe('B')
  })

  it("shows the shown year's leave balance and edits that year's carry-over", () => {
    const steps: Action[] = [
      { type: 'updateStaff', id: 'a', patch: { leaveAllowance: 50, leaveCarry: { '2026': 3 } } },
      on('leave', '2026-10-26'),
      on('leave', '2026-10-27'),
      on('sick', '2026-10-28'),
    ]
    const tracked = steps.reduce(reducer, state)
    const dispatch = vi.fn<(action: Action) => void>()
    render(<AbsenceScreen state={tracked} dispatch={dispatch} />)
    expect(screen.getByText('Szabadság 2026')).toBeTruthy()
    fireEvent.click(screen.getByText('2 / 53'))
    const carry = screen.getByLabelText('Áthozott napok (2026)') as HTMLInputElement
    expect(carry.value).toBe('3')
    fireEvent.change(carry, { target: { value: '5' } })
    expect(dispatch).toHaveBeenLastCalledWith({
      type: 'updateStaff',
      id: 'a',
      patch: { leaveCarry: { '2026': 5 } },
    })
  })
})
```


- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/ui/AbsenceScreen.test.tsx`
Expected: the updated and new tests fail (no kind, no picker, no balance).

- [ ] **Step 3: Texts**

In `src/i18n/hu.ts`, replace the `absences` block of `ui` with:

```ts
  absences: {
    hint: 'Válaszd ki a fajtát, aztán kattints egy napra, vagy húzd végig az egeret a soron. Ugyanazzal a fajtával újra kattintva törlöd.',
    previous: 'Előző hónap',
    next: 'Következő hónap',
    noStaff: 'Előbb vedd fel a munkatársakat.',
    kindsLabel: 'Távollét fajtája',
    kinds: { leave: 'Szabadság', sick: 'Beteg', other: 'Egyéb' } satisfies Record<AbsenceKind, string>,
    letters: { leave: 'Sz', sick: 'B', other: 'E' } satisfies Record<AbsenceKind, string>,
    leaveHeader: (year: string) => `Szabadság ${year}`,
    balance: (used: number, total: number) => `${used} / ${total}`,
    balanceHint: (year: string) =>
      `Szabadság ${year}: kivett napok / éves keret és áthozott napok. Kattints az áthozott napokhoz.`,
    carry: (year: string) => `Áthozott napok (${year})`,
  },
```

- [ ] **Step 4: Rewrite the screen**

Replace `src/ui/AbsenceScreen.tsx` with:

```tsx
import { Fragment, useEffect, useRef, useState } from 'react'
import { isWorkingDay } from '../core/calendar'
import type { AbsenceKind, Staff } from '../core/types'
import { monthLabel, ui, weekdayInitial } from '../i18n/hu'
import type { Action, AppState } from '../state/appState'
import { leaveBalance } from '../state/leave'
import { monthDays, shiftMonth, today } from './dates'

type Props = { state: AppState; dispatch: (action: Action) => void }

const KINDS: readonly AbsenceKind[] = ['leave', 'sick', 'other']

/** Teachers first, then nannies, each by name. */
export function rosterOrder(staff: Staff[]): Staff[] {
  return [...staff].sort((a, b) =>
    a.role === b.role
      ? (a.displayName || a.fullName).localeCompare(b.displayName || b.fullName, 'hu')
      : a.role === 'teacher'
        ? -1
        : 1,
  )
}

export function AbsenceScreen({ state, dispatch }: Props) {
  const [month, setMonth] = useState(() => today().slice(0, 7))
  const [brush, setBrush] = useState<AbsenceKind>('leave')
  const [carryOpen, setCarryOpen] = useState<string>() // whose carry-over editor is open
  // While the button is held, dragging along a row does the same to every cell: paint or clear.
  const drag = useRef<{ staffId: string; paint: boolean } | null>(null)
  useEffect(() => {
    const stop = () => {
      drag.current = null
    }
    window.addEventListener('pointerup', stop)
    return () => window.removeEventListener('pointerup', stop)
  }, [])

  const people = rosterOrder(state.staff.filter((s) => s.active))
  if (people.length === 0) return <p>{ui.absences.noStaff}</p>
  const days = monthDays(month)
  const year = month.slice(0, 4)
  const tracksLeave = people.some((s) => s.leaveAllowance !== undefined)
  const kindOf = new Map(state.absences.map((a) => [`${a.staffId}|${a.date}`, a.kind]))
  const set = (staffId: string, date: string, paint: boolean) =>
    dispatch(
      paint
        ? { type: 'setAbsent', staffId, dates: [date], absent: true, kind: brush }
        : { type: 'setAbsent', staffId, dates: [date], absent: false },
    )
  const setCarry = (person: Staff, value: string) => {
    const carry = { ...person.leaveCarry }
    if (value === '') delete carry[year]
    else carry[year] = Math.max(0, Math.round(Number(value)))
    dispatch({
      type: 'updateStaff',
      id: person.id,
      patch: { leaveCarry: Object.keys(carry).length > 0 ? carry : undefined },
    })
  }

  return (
    <section className="absence-screen">
      <div className="bar">
        <button aria-label={ui.absences.previous} onClick={() => setMonth(shiftMonth(month, -1))}>
          ◀
        </button>
        <h2>{monthLabel(month)}</h2>
        <button aria-label={ui.absences.next} onClick={() => setMonth(shiftMonth(month, 1))}>
          ▶
        </button>
        <div className="toggle kinds" role="group" aria-label={ui.absences.kindsLabel}>
          {KINDS.map((kind) => (
            <button
              key={kind}
              className={brush === kind ? `on kind-${kind}` : `kind-${kind}`}
              aria-pressed={brush === kind}
              onClick={() => setBrush(kind)}
            >
              {ui.absences.kinds[kind]}
            </button>
          ))}
        </div>
      </div>
      <p className="hint">{ui.absences.hint}</p>
      <div className="scroll">
        <table className="absence-grid">
          <thead>
            <tr>
              <th className="name">{tracksLeave ? ui.absences.leaveHeader(year) : ''}</th>
              {days.map((date) => (
                <th key={date} className={isWorkingDay(date) ? undefined : 'off'}>
                  {weekdayInitial(date)}
                  <br />
                  {Number(date.slice(8))}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {people.map((s, i) => {
              const balance =
                s.leaveAllowance === undefined ? undefined : leaveBalance(state.absences, s, year)
              return (
                <Fragment key={s.id}>
                  {/* One grid, so a day's column still reads straight down across both roles. */}
                  {(i === 0 || people[i - 1].role !== s.role) && (
                    <tr>
                      <th scope="row" colSpan={days.length + 1} className="section">
                        {s.role === 'teacher' ? ui.staff.teachers : ui.staff.nannies}
                      </th>
                    </tr>
                  )}
                  <tr>
                    <th className="name">
                      {s.displayName || s.fullName}
                      {balance && (
                        <button
                          className={balance.used > balance.total ? 'leave-balance over' : 'leave-balance'}
                          title={ui.absences.balanceHint(year)}
                          onClick={() => setCarryOpen(carryOpen === s.id ? undefined : s.id)}
                        >
                          {ui.absences.balance(balance.used, balance.total)}
                        </button>
                      )}
                    </th>
                    {days.map((date, d) => {
                      if (!isWorkingDay(date)) return <td key={date} className="off" />
                      const kind = kindOf.get(`${s.id}|${date}`)
                      // The same kind next door: the bar runs on, so a week off reads as one stretch.
                      const joins = (other?: string) =>
                        other !== undefined &&
                        isWorkingDay(other) &&
                        kind !== undefined &&
                        kindOf.get(`${s.id}|${other}`) === kind
                      const className = kind
                        ? ['absent', kind, joins(days[d - 1]) ? 'join-left' : '', joins(days[d + 1]) ? 'join-right' : '']
                            .filter(Boolean)
                            .join(' ')
                        : undefined
                      return (
                        <td
                          key={date}
                          className={className}
                          aria-label={`${s.displayName} ${date}`}
                          onPointerDown={(e) => {
                            e.preventDefault()
                            const paint = kind !== brush
                            drag.current = { staffId: s.id, paint }
                            set(s.id, date, paint)
                          }}
                          onPointerEnter={() => {
                            const held = drag.current
                            if (!held || held.staffId !== s.id) return
                            if (held.paint ? kind !== brush : kind !== undefined) set(s.id, date, held.paint)
                          }}
                        >
                          {kind && (
                            <span className="bar-mark">
                              {joins(days[d - 1]) ? '' : ui.absences.letters[kind]}
                            </span>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                  {carryOpen === s.id && (
                    <tr>
                      <td colSpan={days.length + 1} className="leave-editor">
                        <label>
                          {ui.absences.carry(year)}{' '}
                          <input
                            type="number"
                            min={0}
                            value={s.leaveCarry?.[year] ?? ''}
                            onChange={(e) => setCarry(s, e.target.value)}
                          />
                        </label>
                        <button onClick={() => setCarryOpen(undefined)}>{ui.roster.done}</button>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
```

Notes for the reader of this code:

- `getByLabelText('Áthozott napok (2026)')` finds the input through its wrapping `<label>`.
- The section header row and the old `flatMap` became a `Fragment` per person, because a person can now have a second row (the carry-over editor).
- `'absent leave join-right'` — the kind sits between `absent` and the joins, which the tests read.

- [ ] **Step 5: Run and commit**

Run: `npx prettier --write src tests && npx tsc --noEmit && npx vitest run`
Expected: all pass.

```bash
git add src/ui/AbsenceScreen.tsx src/i18n/hu.ts tests/ui/AbsenceScreen.test.tsx
git commit -m "feat(ui): paint absence kinds; leave balance and carry-over in the month grid"
```

---

### Task 7: Styles and spec

**Files:**
- Modify: `src/app/app.css`, `docs/spec.md`

- [ ] **Step 1: Styles**

In `src/app/app.css`, replace the rule

```css
.absence-grid .bar-mark {
  position: absolute;
  inset: 6px 3px;
  border-radius: 6px;
  background: var(--green);
}
```

with

```css
.absence-grid .bar-mark {
  position: absolute;
  inset: 6px 3px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  color: var(--on-accent);
  font-size: 0.7rem;
  font-weight: bold;
}
/* The kind in colour and in a letter, so colour never carries it alone. */
.absence-grid .leave .bar-mark {
  background: var(--green);
}
.absence-grid .sick .bar-mark {
  background: var(--orange);
}
.absence-grid .other .bar-mark {
  background: var(--grey);
}
```

and append:

```css
.kinds {
  margin-left: 16px;
}
.kinds .kind-sick.on {
  background: var(--orange);
  border-color: var(--orange);
}
.kinds .kind-other.on {
  background: var(--grey);
  border-color: var(--grey);
}
.leave-balance {
  min-height: 24px;
  margin-left: 8px;
  padding: 0 6px;
  border-width: 1px;
  font-size: 0.75rem;
}
.leave-balance.over {
  border-color: var(--orange);
  color: var(--orange);
}
.leave-editor {
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 6px 8px;
}
.leave-editor input,
.staff input.allowance {
  width: 70px;
}
```

- [ ] **Step 2: Spec**

1. §8.1, append: `**Szabadság/év** — optional yearly leave allowance in days (empty = not tracked).`
2. §8.2, replace *"**One absence type in v1.**"* with:

```markdown
**Three kinds** — *Szabadság, Beteg, Egyéb* — picked above the grid; clicking or dragging paints
the chosen kind, clicking a day of that kind clears it, another kind is repainted. Bars carry the
kind in colour (green, orange, grey) and a letter (*Sz, B, E*). For people with an allowance, the
name shows *"kivett / keret"* for the shown month's calendar year (allowance + carry-over, orange
when over); clicking it opens the year's *Áthozott napok* field. The solver ignores the kind.
Call-in suggestions list people on leave first and the sick last, marked *(beteg)*. The person view
of the printout says *szabadság / beteg / távol*.
```

3. §9, in the `AppState` block, `schemaVersion: 1` → `schemaVersion: 2`, and add below the block: `v1 data migrates to v2 with every absence as leave.`
4. §13, delete the bullet that starts `- **Richer absences**` (both lines).

- [ ] **Step 3: Format, check, commit**

```bash
npx prettier --write src docs && npx prettier --check . && npx tsc --noEmit && npx vitest run
git add src/app/app.css docs/spec.md
git commit -m "docs: absence kinds and leave balance; styles"
```

---

## Self-review notes

- Design §D coverage: three kinds (Tasks 1, 6), picker paint/clear/repaint (Task 6 tests 1–2), colour + letter (Tasks 6–7), print words (Task 4), call-in order with *(beteg)* and the same order in `explain` (Task 3), allowance (Task 5), balance per calendar year with typed carry-over (Tasks 5–6), over-allowance shown not blocked (`.over`), schema 1 → 2 with leave as the v1 kind (Task 1).
- The solver and the fingerprint never read `kind`: `inputKey` lists `staffId|date` only, so repainting a day's kind doesn't make a roster outdated.
- Names used consistently: `AbsenceKind`, `Absence.kind`, `Staff.leaveAllowance`, `Staff.leaveCarry`, `leaveBalance`, `CALL_IN_ORDER`, `ABSENCE_WORD`, `DayFix.sick`, `ui.absences.{kinds, letters, leaveHeader, balance, balanceHint, carry}`.
- Undoing a call-in restores the absence's kind (Task 2); a missing kind falls back to leave in the reducer.
