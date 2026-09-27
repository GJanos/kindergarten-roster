# v2-A — Warning texts follow renames — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A renamed person shows with their new name in every roster's warnings — on screen, in print and in the Excel footnotes — including rosters saved before the rename.

**Architecture:** `explain` stops writing names into warning texts and writes a *name reference* instead: the staff id between the private-use characters `` and ``. `resolveNames(text, staff)` turns references into current display names wherever warning text is shown. Both live in `src/core/names.ts`, so `core/` stays pure. Rosters saved earlier hold plain names and show unchanged.

**Tech Stack:** TypeScript, React 19, vitest 5 (jsdom for UI tests).

---

## Before you start

- Design: `docs/specs/2026-09-27-v2-design.md`, section A. Spec: `docs/spec.md` §7.
- `npm test` is green on `main`. Conventions as in the v1 plans: Git Bash, tests first in `tests/` mirroring `src/`, one commit per task, `npx prettier --write` on touched files before committing.
- The golden test (`tests/scripts/golden.test.ts`) runs only where `data/aug24.json` exists. Task 4 updates its snapshot there.

## File structure

```text
src/core/names.ts            NEW  nameRef(id), resolveNames(text, staff)
src/core/explain.ts          names → nameRef
src/export/views.ts          footnotes(roster, staff) resolves names
src/ui/WarningsPanel.tsx     resolves names; new `staff` prop
src/ui/RosterScreen.tsx      passes staff to the panel and the footnotes
src/ui/PrintView.tsx         footnotes(roster, staff)
scripts/slice.ts             footnotes(roster, input.staff); console output resolved
tests/core/names.test.ts     NEW
tests/core/explain.test.ts   reads resolved texts; one test on the raw reference
tests/export/footnotes.test.ts  a reference in a footnote
tests/ui/RosterScreen.test.tsx  a rename after solving shows the new name
docs/spec.md                 §7 note; §13 item removed
```

---

### Task 1: Name references

**Files:**
- Create: `src/core/names.ts`
- Test: `tests/core/names.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
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
    expect(resolveNames(`Hívj be valakit: ${nameRef('t1')}, ${nameRef('n1')} (távol).`, staff)).toBe(
      'Hívj be valakit: T1, N1 (távol).',
    )
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
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/core/names.test.ts`
Expected: FAIL — `Failed to resolve import "../../src/core/names"`.

- [ ] **Step 3: Implement**

```ts
import type { Staff } from './types'

const OPEN = ''
const CLOSE = ''
const REFERENCE = /([^]*)/g

/**
 * A person inside a warning text, written as a reference (private-use characters nobody types)
 * and resolved on display, so a later rename reaches rosters saved before it.
 */
export function nameRef(staffId: string): string {
  return `${OPEN}${staffId}${CLOSE}`
}

/** Each reference in `text` → that person's current display name; '?' if they are gone. */
export function resolveNames(text: string, staff: Staff[]): string {
  if (!text.includes(OPEN)) return text
  const names = new Map(staff.map((s) => [s.id, s.displayName]))
  return text.replace(REFERENCE, (_, id: string) => names.get(id) ?? '?')
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `npx vitest run tests/core/names.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/names.ts tests/core/names.test.ts
git commit -m "feat(core): name references for warning texts"
```

---

### Task 2: `explain` writes references

**Files:**
- Modify: `src/core/explain.ts` (the `name` helper near the top of `explain`)
- Modify: `tests/core/explain.test.ts`

- [ ] **Step 1: Make the explain tests read what she will see, and add one on the raw text**

At the top of `tests/core/explain.test.ts`, replace

```ts
import { explain } from '../../src/core/explain'
```

with

```ts
import { explain as explainRaw } from '../../src/core/explain'
import { nameRef, resolveNames } from '../../src/core/names'
```

and, below the imports, add:

```ts
/** What she sees: the warnings with every name reference resolved. */
function explain(input: SolveInput, roster: Roster) {
  return explainRaw(input, roster).map((w) => ({
    ...w,
    text: resolveNames(w.text, input.staff),
    ...(w.action ? { action: resolveNames(w.action, input.staff) } : {}),
  }))
}
```

Every existing test keeps its expected Hungarian text. Then add this test inside `describe('explain — day level', …)`, after the `'asks to call someone in when no teacher is there'` test:

```ts
  it('stores names as references, so a later rename reaches the text', () => {
    const input = makeInput({
      teachers: 2,
      nannies: 2,
      groups: 1,
      days: [WED],
      absent: { t1: [WED], t2: [WED] },
    })
    const [warning] = explainRaw(input, solve(input, highs, TEST_META))
    expect(warning.action).toBe(`Hívj be valakit: ${nameRef('t1')}, ${nameRef('t2')} (távol).`)
  })
```

- [ ] **Step 2: Run it to see only the new test fail**

Run: `npx vitest run tests/core/explain.test.ts`
Expected: 1 failed — `expected 'Hívj be valakit: T1, T2 (távol).' to be 'Hívj be valakit: t1, …'`; every other test passes.

- [ ] **Step 3: Implement**

In `src/core/explain.ts`, add the import

```ts
import { nameRef } from './names'
```

and replace

```ts
  const name = (id: string) => staff.get(id)?.displayName ?? '?'
```

with

```ts
  // References, not names: resolved on display, so a rename reaches saved rosters too.
  const name = nameRef
```

- [ ] **Step 4: Run the core tests**

Run: `npx vitest run tests/core`
Expected: PASS. (`properties.test.ts` checks warning codes, not texts.)

- [ ] **Step 5: Commit**

```bash
git add src/core/explain.ts tests/core/explain.test.ts
git commit -m "feat(core): explain writes name references instead of names"
```

---

### Task 3: Resolve names wherever warnings are shown

**Files:**
- Modify: `src/export/views.ts` (`footnotes`)
- Modify: `src/ui/WarningsPanel.tsx`, `src/ui/RosterScreen.tsx`, `src/ui/PrintView.tsx`, `scripts/slice.ts`
- Test: `tests/export/footnotes.test.ts`, `tests/ui/RosterScreen.test.tsx`

- [ ] **Step 1: Write the failing tests**

In `tests/export/footnotes.test.ts`, add the imports

```ts
import { makeStaff } from '../core/fixtures'
import { nameRef } from '../../src/core/names'
```

change the existing call `footnotes(roster)` to `footnotes(roster, [])`, and add a second test inside the `describe`:

```ts
  it('prints the current name for a name reference', () => {
    const roster: Roster = {
      period: { start: WED, days: [WED] },
      groupsPerDay: { [WED]: 1 },
      assignments: [],
      holes: [],
      warnings: [
        {
          code: 'SUBSTITUTION',
          severity: 'orange',
          date: WED,
          text: `Szerda, 1. cs.: dajka helyett óvónő — ${nameRef('t1')}.`,
          cells: [],
        },
      ],
      ...TEST_META,
    }
    expect(footnotes(roster, makeStaff(1, 0))).toEqual([
      '* Szerda, 1. cs.: dajka helyett óvónő — T1.',
    ])
  })
```

In `tests/ui/RosterScreen.test.tsx`, add `import { nameRef } from '../../src/core/names'` to the imports and this test inside `describe('RosterScreen', …)`:

```ts
  it('shows a renamed person by the new name in a saved roster', () => {
    const substitution: Warning = {
      code: 'SUBSTITUTION',
      severity: 'orange',
      date: WED,
      text: `Szerda, 2. cs.: dajka helyett óvónő — ${nameRef('t4')}.`,
      cells: [{ staffId: 't4', date: WED, group: 2 }],
    }
    const saved = reducer(base, {
      type: 'saveRoster',
      week: WEEK,
      roster: { ...roster, warnings: [substitution] },
      inputKey: inputKey(solveInputFor(base, WEEK)),
    })
    renderScreen(reducer(saved, { type: 'updateStaff', id: 't4', patch: { displayName: 'Tímea' } }))
    expect(screen.getByText('2. cs.: dajka helyett óvónő — Tímea.')).toBeTruthy()
  })
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/export/footnotes.test.ts tests/ui/RosterScreen.test.tsx`
Expected: the footnote test fails with the raw `t1` in the output; the RosterScreen test fails with `Unable to find an element with the text: 2. cs.: dajka helyett óvónő — Tímea.`

- [ ] **Step 3: Resolve in the footnotes**

In `src/export/views.ts`, add `import { resolveNames } from '../core/names'` and replace `footnotes` with:

```ts
/** Red and orange warnings print as footnotes; grey ones stay on screen (spec §7). */
export function footnotes(roster: Roster, staff: Staff[]): string[] {
  return roster.warnings
    .filter((w) => w.severity !== 'grey')
    .map((w) => resolveNames(`* ${w.text}${w.action ? ` ${w.action}` : ''}`, staff))
}
```

- [ ] **Step 4: Resolve in the warnings panel**

In `src/ui/WarningsPanel.tsx`:

1. Change the imports to

```ts
import { resolveNames } from '../core/names'
import type { SolveInput, Staff, Warning } from '../core/types'
```

2. Add `staff: Staff[] // everyone, hidden people included, so old rosters resolve` to `Props`, and `staff` to the destructured props of `WarningsPanel`.
3. Right after `const { days, notes } = warningDays(warnings, input)`, add:

```ts
  const shown = (text: string) => resolveNames(text, staff)
```

4. In the `line` helper, render `{shown(text)}` instead of `{text}`.
5. In the actions list, render `{shown(action)}` instead of `{action}`.

- [ ] **Step 5: Pass the staff along**

In `src/ui/RosterScreen.tsx`:

- in `exportExcel`, `footnotes: footnotes(roster),` → `footnotes: footnotes(roster, state.staff),`
- on `<WarningsPanel`, add the prop `staff={state.staff}`.

In `src/ui/PrintView.tsx`, `const notes = footnotes(roster)` → `const notes = footnotes(roster, staff)`.

In `scripts/slice.ts`:

- add `import { resolveNames } from '../src/core/names'`
- `footnotes: footnotes(roster),` → `footnotes: footnotes(roster, input.staff),`
- replace the last loop with

```ts
for (const w of roster.warnings) {
  const text = `${w.text}${w.action ? ` ${w.action}` : ''}`
  console.log(`${w.severity.padEnd(6)} ${resolveNames(text, input.staff)}`)
}
```

- [ ] **Step 6: Run everything**

Run: `npx tsc --noEmit && npx vitest run`
Expected: no type errors; all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/export/views.ts src/ui/WarningsPanel.tsx src/ui/RosterScreen.tsx src/ui/PrintView.tsx scripts/slice.ts tests/export/footnotes.test.ts tests/ui/RosterScreen.test.tsx
git commit -m "feat(ui): resolve warning name references on screen, in print and in Excel"
```

---

### Task 4: Golden snapshot and spec

**Files:**
- Modify: `data/aug24.snapshot.json` (local only, gitignored)
- Modify: `docs/spec.md`

- [ ] **Step 1: Check the golden week where its data exists**

Run: `npx vitest run tests/scripts/golden.test.ts`
Expected where `data/aug24.json` exists: FAIL with a snapshot diff. Read it: the **only** changes allowed are names inside `"text"` and `"action"` turning into `<id>` references. Any change in `assignments` or `holes` is a bug — stop and find it. Where the data doesn't exist the test is skipped; skip to Step 3.

- [ ] **Step 2: Update the snapshot**

Run: `npx vitest run tests/scripts/golden.test.ts -u`
Expected: `1 passed`, snapshot updated. (`data/` is gitignored; nothing to commit.)

- [ ] **Step 3: Spec**

In `docs/spec.md` §7, after the paragraph that ends *"Warnings are saved with the roster. Wording is tested with her at the demo."*, add:

```markdown
Names inside warning texts are stored as references (the staff id between `` and ``)
and resolved to the current display name on screen, in print and in the Excel footnotes, so a
rename reaches rosters saved before it. Texts saved before v2 hold plain names and show as they are.
```

In §13, delete the bullet that starts with `- **Warning texts follow renames**` (both of its lines).

- [ ] **Step 4: Format, check, commit**

```bash
npx prettier --write docs/spec.md && npx prettier --check . && npx vitest run
git add docs/spec.md
git commit -m "docs: warning texts follow renames"
```

Expected before the commit: `All matched files use Prettier code style!` and all tests pass.

---

## Self-review notes

- Spec coverage (design §A): references in `explain` (Task 2), resolution on screen (Task 3, Step 4), print (Step 5, PrintView), Excel (Step 5, `exportExcel`), old rosters unchanged (Task 1 test 4), hidden people resolve (`state.staff` is passed, not the active list).
- The day cards strip a leading `Hétfő, ` from the stored text before resolving; a reference never starts a text, so that check is unaffected.
- The call-in buttons use `displayName` directly (`warningDays.callIns`), so they were already current.
