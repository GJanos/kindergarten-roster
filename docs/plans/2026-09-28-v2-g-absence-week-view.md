# v2-G — Absence planner week view — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Távollétek gets a [Hónap] [Hét] switch. The week view is the same absence grid for one week's working days, and its week is shared with Beosztás.

**Architecture:**
- The table moves out of `AbsenceScreen` into `AbsenceGrid`, driven by a `days` list.
- `AbsenceScreen` keeps the bar (the view switch, per-view navigation, the kind brushes) and picks the days: the month's days, or `periodForWeek(week).days`.
- `App` owns `week` (already shared with `RosterScreen`) and the new `absenceView`.

**Tech Stack:** TypeScript, React 19, vitest 5 with jsdom.

---

## Before you start

- Design: `docs/specs/2026-09-28-absence-week-view-design.md`. Branch `v2-f-sick-call` (this lands with v2-F).
- Conventions: tests first in `tests/` mirroring `src/`; `npx prettier --write` touched files; one commit per task.

## File structure

```text
src/ui/AbsenceGrid.tsx        NEW  the person × day table (moved from AbsenceScreen)
src/ui/AbsenceScreen.tsx      bar: view switch, month or week navigation; props week/onWeek/view/onView
src/app/App.tsx               absenceView state; passes week/onWeek/view/onView
src/i18n/hu.ts                absences.views, previousWeek, nextWeek
src/app/app.css               .absence-grid.wide, .views
tests/ui/AbsenceScreen.test.tsx   renders through a harness with the new props; week-view tests
docs/spec.md                  §8.2
```

---

### Task 1: Move the table into `AbsenceGrid` (pure refactor)

- [ ] **Step 1:** Change the test file's rendering to go through a harness that owns `week` and `view`, so later tests can switch views. In `tests/ui/AbsenceScreen.test.tsx`, replace every `render(<AbsenceScreen state={X} dispatch={Y} />)` with `render(<Screen state={X} dispatch={Y} />)`, and `renderScreen` with the same. Add:

```tsx
import { useState } from 'react'
import type { AppState } from '../../src/state/appState'
import type { AbsenceView } from '../../src/ui/AbsenceScreen'

/** The screen as App mounts it: the week shared with Beosztás, the view kept above the tab. */
function Screen(props: {
  state: AppState
  dispatch: (action: Action) => void
  week?: string
  onWeek?: (week: string) => void
}) {
  const [week, setWeek] = useState(props.week ?? '2026-10-26')
  const [view, setView] = useState<AbsenceView>('month')
  return (
    <AbsenceScreen
      state={props.state}
      dispatch={props.dispatch}
      week={week}
      onWeek={(next) => {
        setWeek(next)
        props.onWeek?.(next)
      }}
      view={view}
      onView={setView}
    />
  )
}
```

- [ ] **Step 2:** Run `npx vitest run tests/ui/AbsenceScreen.test.tsx`. Expected: typecheck/type errors aside, tests FAIL because `AbsenceView` does not exist.
- [ ] **Step 3:** Create `src/ui/AbsenceGrid.tsx` holding the `<div className="scroll"><table className="absence-grid">…</table></div>` part of `AbsenceScreen` unchanged, with props:

```ts
type Props = {
  state: AppState
  dispatch: (action: Action) => void
  people: Staff[] // rosterOrder of the active staff
  days: string[]
  brush: AbsenceKind
  wide?: boolean // the week view: wider cells, full day headers
}
```

The grid owns `carryOpen`, the drag ref and its `pointerup` listener, `kindOf`, `set`, `setCarry` and `coverage`. The header cell renders `wide ? dayHeader(date) : <>{weekdayInitial(date)}<br />{Number(date.slice(8))}</>`, and the table class is `wide ? 'absence-grid wide' : 'absence-grid'`. The leave year stays the year of `days[0]`.

In `AbsenceScreen.tsx` export `type AbsenceView = 'month' | 'week'`, add the props `week: string; onWeek: (week: string) => void; view: AbsenceView; onView: (view: AbsenceView) => void`, and render `<AbsenceGrid … days={monthDays(month)} brush={brush} />`. `App.tsx` passes `week={week} onWeek={setWeek}` and a new `const [absenceView, setAbsenceView] = useState<AbsenceView>('month')`.

- [ ] **Step 4:** Run `npx vitest run tests/ui tests/app` and `npm run typecheck`. Expected: all PASS, with no behaviour change.
- [ ] **Step 5:** Prettier, then commit `refactor(absences): the grid is its own component, driven by a list of days`.

### Task 2: The week view

- [ ] **Step 1: Failing tests.** Append to `tests/ui/AbsenceScreen.test.tsx`:

```tsx
describe('AbsenceScreen week view', () => {
  it("shows the shared week's working days, full headers, painting as in the month", () => {
    const dispatch = vi.fn<(action: Action) => void>()
    render(<Screen state={state} dispatch={dispatch} week="2026-10-19" />)
    fireEvent.click(screen.getByText('Hét'))
    expect(screen.getByText('2026. október 19 – 22.')).toBeTruthy() // Friday the 23rd is a holiday
    expect(screen.getByText('Hétfő 10.19.')).toBeTruthy()
    expect(screen.queryByLabelText('Anna 2026-10-23')).toBeNull()
    expect(document.querySelectorAll('thead th')).toHaveLength(5) // names + 4 days
    fireEvent.pointerDown(screen.getByLabelText('Anna 2026-10-20'))
    expect(dispatch).toHaveBeenCalledWith({
      type: 'setAbsent',
      staffId: 'a',
      dates: ['2026-10-20'],
      absent: true,
      kind: 'leave',
    })
  })

  it('steps week by week, moving the week Beosztás shows too', () => {
    const onWeek = vi.fn()
    render(<Screen state={state} dispatch={vi.fn()} onWeek={onWeek} />)
    fireEvent.click(screen.getByText('Hét'))
    fireEvent.click(screen.getByLabelText('Következő hét'))
    expect(onWeek).toHaveBeenLastCalledWith('2026-11-02')
    expect(screen.getByText('2026. november 2 – 6.')).toBeTruthy()
    fireEvent.click(screen.getByLabelText('Előző hét'))
    fireEvent.click(screen.getByLabelText('Előző hét'))
    expect(onWeek).toHaveBeenLastCalledWith('2026-10-19')
  })

  it('jumps to the current week, offered only away from it', () => {
    render(<Screen state={state} dispatch={vi.fn()} />) // week of Oct 26; today is Oct 5
    fireEvent.click(screen.getByText('Hét'))
    fireEvent.click(screen.getByText('Ma'))
    expect(screen.getByText('2026. október 5 – 9.')).toBeTruthy()
    expect(screen.queryByText('Ma')).toBeNull()
  })

  it('opens the month of the week when switching back', () => {
    render(<Screen state={state} dispatch={vi.fn()} week="2026-11-30" />)
    fireEvent.click(screen.getByText('Hét'))
    fireEvent.click(screen.getByText('Hónap'))
    expect(screen.getByText('2026. november')).toBeTruthy()
  })
})
```

- [ ] **Step 2:** Run it. Expected: FAIL, with no *Hét* button.
- [ ] **Step 3: Strings** in `ui.absences`: `views: { month: 'Hónap', week: 'Hét' }`, `previousWeek: 'Előző hét'`, `nextWeek: 'Következő hét'`.
- [ ] **Step 4: `AbsenceScreen`.** Before the ◀ button, a `<div className="views" role="group">` with two buttons (`aria-pressed`, class `on` for the current view). Hét calls `onView('week')`. Hónap calls `setMonth(week.slice(0, 7))` then `onView('month')`, so the month is the one holding the week's Monday.
  - **In the week view:** ◀/▶ call `onWeek(addDays(week, ∓7))` with the week aria-labels, the title is `formatPeriod(periodForWeek(week).days)`, and **Ma** (shown when `week !== mondayOf(now)`) calls `onWeek(mondayOf(now))`. The grid gets `days={periodForWeek(week).days}` and `wide`.
  - **The month view** is as before.
- [ ] **Step 5: CSS.** Style `.views` like `.kinds`, and add `.absence-grid.wide td, .absence-grid.wide thead th { width: 90px; min-width: 90px; }` and `.absence-grid.wide td { height: 36px; }`.
- [ ] **Step 6:** Run `npx vitest run tests/ui tests/app`, `npm run typecheck`. Expected: PASS.
- [ ] **Step 7:** Prettier, then commit `feat(absences): a week view sharing its week with Beosztás`.

### Task 3: Spec and gate

- [ ] **Step 1:** `docs/spec.md` §8.2: add a bullet describing the Hónap / Hét switch and the shared week, and set the design's status to *implemented*.
- [ ] **Step 2:** `npm test`, `npm run typecheck`, `npm run format:check`, `npm run build`: all green.
- [ ] **Step 3:** Commit `docs: the absence planner's week view`.
