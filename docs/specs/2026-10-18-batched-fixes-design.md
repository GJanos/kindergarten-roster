# kindergarten-roster — quick fixes in one go

Status: **agreed with the user, 2026-10-18**, after testing v3-b. It changes the warning cards'
quick fixes (*"Kedden 2 csoport"*, *"Anna mégis jön"*).

## Problem

Each fix button solves at once. Since v3-b a solve takes 10–60 s, and her fixes usually come in
sets: call Anna in on Tuesday, Bea on Thursday, and set Friday to 2 groups. That means three waits
and three rosters, where one solve would do.

## What she sees

- **A fix button selects instead of solving.** It shows ✓ and stays pressed. A second click
  deselects it.
- **One group count a day:** choosing *"Pénteken 2 csoport"* replaces another count chosen for
  Friday. Call-ins add up.
- **Each card estimates what its selections leave:** *"2 hiány → várhatóan rendben"* or *"→
  várhatóan 1 hiány"*. It's counted from the headcount at once, without a solve, so she sees when
  a day is covered and doesn't over-call.
- **The floating dock** (nothing on the page moves) lists the selections: *"3 változtatás
  kijelölve: Anna mégis jön kedden · Bea mégis jön csütörtökön · Pénteken 2 csoport"*. Then come
  **Alkalmaz és újraszámol** and **Mégse**.
- **One solve, one undo step.** Undo restores every absence and group count, and the old roster.
- **In a week in progress** it's one fewest-changes recalc, as a single fix was before.
- Selections clear on a week change and on any solve.

## How it's built

- `src/core/capacity.ts`: `expectedHoles(day)`, the red items a solved day has: empty teacher
  seats, missing keys, a missing ügyelet, no teacher at all. Holes depend only on the headcount,
  because the solver's first stage makes them as few as possible. The property tests check it
  against the solver on every random period.
- `src/ui/pendingFixes.ts`: `toggleFix` (the selection rules) and `fixActions` (the actions,
  their inverses and the undo label).
- `WarningsPanel` takes `pending` and `estimates`. `RosterScreen` holds the selection, works out
  the estimates from the state with the selections applied, and shows the dock bar.

## Decisions

- **A single fix takes two clicks now** (select, apply). It's the price of one consistent way to
  fix.
- **The estimate is only shown for days with a selection.** Other cards keep their badge as it is.
