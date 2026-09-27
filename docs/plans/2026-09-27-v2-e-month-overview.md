# v2-E — Month overview polish — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Távollétek month grid reads at a glance: today's column outlined, break days tinted, an away-count row per role that turns orange when too few are left, a name column that stays put while scrolling, and a *Ma* button back to the current month.

**Architecture:** All of it lives in `src/ui/AbsenceScreen.tsx` (as rewritten by v2-D) and `app.css`. The count row asks the week's own group count (`periodState` → `groupCount`) and `zeroHoleNeeds` from the capacity model, so the hint agrees with the roster screen's day chips.

**Tech Stack:** React 19, vitest 5 with jsdom.

---

## Before you start

- **Prerequisite:** `2026-09-27-v2-d-absence-types.md` is done — this plan edits the screen it rewrote.
- Design: `docs/specs/2026-09-27-v2-design.md`, section E (the spec only says *"Month overview polish"*; the design defines it). Spec: `docs/spec.md` §8.2.
- `tests/ui/AbsenceScreen.test.tsx` fakes today as **2026-10-05** (a Monday). Break days around it: Oct 23 – Nov 1 (`SCHOOL_BREAKS` in `src/core/calendar.ts`).
- Conventions as in the v1 plans.

## File structure

```text
src/ui/AbsenceScreen.tsx     today / break classes; away-count rows; Ma button
src/i18n/hu.ts               texts
src/app/app.css              today outline, break tint, count row, sticky names
tests/ui/AbsenceScreen.test.tsx
docs/spec.md                 §8.2, §13
```

---

### Task 1: Today and the break days stand out

**Files:**
- Modify: `src/ui/AbsenceScreen.tsx`
- Test: `tests/ui/AbsenceScreen.test.tsx`

- [ ] **Step 1: Write the failing test**

Append to `tests/ui/AbsenceScreen.test.tsx`:

```ts
describe('AbsenceScreen at a glance', () => {
  const header = (text: string) =>
    [...document.querySelectorAll('thead th')].find((th) => th.textContent === text)!

  it("outlines today's column and tints the school-break days", () => {
    render(<AbsenceScreen state={state} dispatch={vi.fn()} />)
    expect(header('H5').className).toBe('today') // Monday 5 October, today in these tests
    expect(screen.getByLabelText('Anna 2026-10-05').className).toBe('today')
    expect(header('H26').className).toBe('break') // the autumn break
    expect(header('P23').className).toBe('off break') // a holiday inside the break
    expect(header('K6').className).toBe('')
  })
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/ui/AbsenceScreen.test.tsx`
Expected: FAIL — no `today` / `break` classes.

- [ ] **Step 3: Implement**

In `src/ui/AbsenceScreen.tsx`:

1. `import { isWorkingDay } from '../core/calendar'` → `import { isBreakDay, isWorkingDay } from '../core/calendar'`.
2. After `const year = month.slice(0, 4)`, add:

```ts
  const now = today()
  const classes = (...names: (string | false)[]) => names.filter(Boolean).join(' ') || undefined
```

3. The header cell `<th key={date} className={isWorkingDay(date) ? undefined : 'off'}>` becomes

```tsx
                <th
                  key={date}
                  className={classes(!isWorkingDay(date) && 'off', isBreakDay(date) && 'break', date === now && 'today')}
                >
```

4. The off cell `return <td key={date} className="off" />` becomes

```tsx
                      if (!isWorkingDay(date))
                        return <td key={date} className={classes('off', date === now && 'today')} />
```

5. In the working cell, the `className` expression becomes

```ts
                      const className = classes(
                        kind !== undefined && 'absent',
                        kind ?? false,
                        joins(days[d - 1]) && 'join-left',
                        joins(days[d + 1]) && 'join-right',
                        date === now && 'today',
                      )
```

(`classes` returns `undefined` for no classes, so an ordinary cell keeps `className=""` in the DOM and the older tests' `toBe('')` still holds.)

- [ ] **Step 4: Run and commit**

Run: `npx vitest run tests/ui/AbsenceScreen.test.tsx`
Expected: PASS — the older class expectations (`'absent leave join-right'` …) are unchanged, since none of those dates is today.

```bash
git add src/ui/AbsenceScreen.tsx tests/ui/AbsenceScreen.test.tsx
git commit -m "feat(ui): today's column and break days stand out in the month grid"
```

---

### Task 2: Away counts per role

**Files:**
- Modify: `src/ui/AbsenceScreen.tsx`, `src/i18n/hu.ts`
- Test: `tests/ui/AbsenceScreen.test.tsx`

- [ ] **Step 1: Write the failing test**

Add `import { makeStaff } from '../core/fixtures'` to the imports of `tests/ui/AbsenceScreen.test.tsx` and, inside `describe('AbsenceScreen at a glance', …)`:

```ts
  it('counts who is away per role, orange when too few are left for the week’s groups', () => {
    // 5 teachers, 2 nannies, 2 groups (the default): zero holes needs 4 teachers and 2 nannies.
    const away = (staffId: string, date: string): Action => ({
      type: 'setAbsent',
      staffId,
      dates: [date],
      absent: true,
    })
    const crew = [away('t1', '2026-10-26'), away('t2', '2026-10-26'), away('t1', '2026-10-27')]
      .reduce(reducer, { ...emptyState(), staff: makeStaff(5, 2) })
    render(<AbsenceScreen state={crew} dispatch={vi.fn()} />)
    const teachers = (date: string) => screen.getByLabelText(`Távol (óvónő) ${date}`)
    expect(teachers('2026-10-26').textContent).toBe('2')
    expect(teachers('2026-10-26').className).toBe('count short') // 3 left, 4 needed
    expect(teachers('2026-10-27').textContent).toBe('1')
    expect(teachers('2026-10-27').className).toBe('count') // 4 left
    expect(screen.getByLabelText('Távol (dajka) 2026-10-26').textContent).toBe('')
  })
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/ui/AbsenceScreen.test.tsx`
Expected: FAIL — `Unable to find a label with the text of: Távol (óvónő) 2026-10-26`.

- [ ] **Step 3: Texts**

In `src/i18n/hu.ts`, inside `ui.absences`:

```ts
    away: { teacher: 'Távol (óvónő)', nanny: 'Távol (dajka)' } satisfies Record<Role, string>,
    shortHint:
      'Narancs: aznap kevesebben maradnak, mint amennyi a hét csoportszámához kell (csoportonként 2 óvónő, 1 dajka, de legalább 2 dajka).',
```

with `Role` added to the `../core/types` import at the top of `hu.ts`.

- [ ] **Step 4: The rows**

In `src/ui/AbsenceScreen.tsx`:

1. Add the imports

```ts
import { mondayOf } from '../core/calendar'
import { zeroHoleNeeds } from '../core/capacity'
import { groupCount, periodState } from '../state/appState'
```

(merge `mondayOf` into the existing `../core/calendar` import and change `import type { Action, AppState } from '../state/appState'` to `import { groupCount, periodState, type Action, type AppState } from '../state/appState'`), and add `Role` to the `../core/types` type import.

2. After `setCarry`, add:

```ts
  // Enough left for the week's groups? The same need as the roster screen's day chips.
  const coverage = (role: Role, date: string) => {
    const members = people.filter((p) => p.role === role)
    const away = members.filter((p) => kindOf.has(`${p.id}|${date}`)).length
    const needs = zeroHoleNeeds(groupCount(periodState(state, mondayOf(date))))
    return { away, short: members.length - away < (role === 'teacher' ? needs.teachers : needs.nannies) }
  }
```

3. Inside the person `Fragment`, after the carry-over editor row, add:

```tsx
                  {(i === people.length - 1 || people[i + 1].role !== s.role) && (
                    <tr className="away-row">
                      <th scope="row" className="count" title={ui.absences.shortHint}>
                        {ui.absences.away[s.role]}
                      </th>
                      {days.map((date) => {
                        if (!isWorkingDay(date)) return <td key={date} className="off" />
                        const { away, short } = coverage(s.role, date)
                        return (
                          <td
                            key={date}
                            className={short ? 'count short' : 'count'}
                            aria-label={`${ui.absences.away[s.role]} ${date}`}
                          >
                            {away || ''}
                          </td>
                        )
                      })}
                    </tr>
                  )}
```

- [ ] **Step 5: Run and commit**

Run: `npx tsc --noEmit && npx vitest run tests/ui/AbsenceScreen.test.tsx`
Expected: PASS. (The section-header test filters row headers by `className === 'section'`, so the new `count` headers don't disturb it.)

```bash
git add src/ui/AbsenceScreen.tsx src/i18n/hu.ts tests/ui/AbsenceScreen.test.tsx
git commit -m "feat(ui): away counts per role in the month grid"
```

---

### Task 3: *Ma* — back to this month

**Files:**
- Modify: `src/ui/AbsenceScreen.tsx`, `src/i18n/hu.ts`
- Test: `tests/ui/AbsenceScreen.test.tsx`

- [ ] **Step 1: Write the failing test**

Inside `describe('AbsenceScreen at a glance', …)`:

```ts
  it('jumps back to the current month, offered only away from it', () => {
    render(<AbsenceScreen state={state} dispatch={vi.fn()} />)
    expect(screen.queryByText('Ma')).toBeNull()
    fireEvent.click(screen.getByLabelText('Következő hónap'))
    fireEvent.click(screen.getByLabelText('Következő hónap'))
    expect(screen.getByText('2026. december')).toBeTruthy()
    fireEvent.click(screen.getByText('Ma'))
    expect(screen.getByText('2026. október')).toBeTruthy()
  })
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/ui/AbsenceScreen.test.tsx`
Expected: FAIL — no *Ma* button.

- [ ] **Step 3: Implement**

`src/i18n/hu.ts`, inside `ui.absences`: `today: 'Ma',`.

`src/ui/AbsenceScreen.tsx`, in the bar, directly after the ▶ button:

```tsx
        {month !== now.slice(0, 7) && (
          <button onClick={() => setMonth(now.slice(0, 7))}>{ui.absences.today}</button>
        )}
```

- [ ] **Step 4: Run and commit**

Run: `npx vitest run tests/ui/AbsenceScreen.test.tsx`
Expected: PASS.

```bash
git add src/ui/AbsenceScreen.tsx src/i18n/hu.ts tests/ui/AbsenceScreen.test.tsx
git commit -m "feat(ui): Ma button back to the current month"
```

---

### Task 4: Styles and spec

**Files:**
- Modify: `src/app/app.css`, `docs/spec.md`

- [ ] **Step 1: Styles**

In `src/app/app.css`, change the hover rule's selector `.absence-grid td:not(.off):hover` to `.absence-grid td:not(.off):not(.count):hover`, and append:

```css
/* The month at a glance: today, the break, who is away, names always in view. */
.absence-grid .today {
  box-shadow: inset 0 0 0 2px var(--green);
}
.absence-grid thead th.break {
  background: var(--changed-bg);
}
.absence-grid td.count,
.absence-grid th.count {
  height: 24px;
  color: var(--grey);
  font-size: 0.75rem;
  cursor: default;
}
.absence-grid td.count.short {
  background: var(--warn-bg);
  color: var(--orange);
  font-weight: bold;
}
.absence-grid .name,
.absence-grid th.count {
  position: sticky;
  left: 0;
  z-index: 1;
  background: var(--bg);
}
```

- [ ] **Step 2: Look at it**

Run: `npm run dev`, open the Távollétek tab in both themes (the ☾ / ☀ button), scroll the grid sideways on a narrow window. Check: names stay put and aren't overdrawn by bars; today's outline and the break tint are visible in dark mode; the count rows are quiet unless orange.

- [ ] **Step 3: Spec**

In `docs/spec.md` §8.2, append:

```markdown
At a glance: today's column is outlined, school-break days have a tinted header, a *Távol* row
under each role counts who is away (orange when fewer are left than the week's group count needs
for zero holes), the name column stays put while the grid scrolls, and **Ma** jumps back to the
current month.
```

and in §13 delete the bullet `- Month overview polish.`

- [ ] **Step 4: Format, check, commit**

```bash
npx prettier --write src docs && npx prettier --check . && npx tsc --noEmit && npx vitest run
git add src/app/app.css docs/spec.md
git commit -m "docs: month overview polish; styles"
```

---

## Self-review notes

- Design §E coverage: today (Task 1), break tint (Task 1), count row with the week's own need (Task 2), sticky names (Task 4 CSS), *Ma* (Task 3).
- The count row reuses `zeroHoleNeeds` and `groupCount(periodState(…))`, so it never disagrees with the roster screen's day chips about "enough".
- Class names used by tests: `today`, `break`, `off`, `count`, `short`. The `classes` helper keeps the order `absent → kind → joins → today`, which the v2-D tests read.
