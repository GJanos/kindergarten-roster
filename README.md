# kindergarten-roster

A break-week staff roster for one kindergarten. The head of staff enters the staff list, the
absences and the number of groups; the app produces a fair Monday–Friday roster she can print and
post. By hand it took her three to four hours per school break.

**Demo:** https://gjanos.github.io/kindergarten-roster/ — choose _Bemutató adatok_ (invented
people).

## What she can do

Three tabs, all in Hungarian.

**Munkatársak (staff)**

- The staff list: teachers and nannies, the short name that appears on the wall, and a yearly
  leave allowance. Someone who has left is hidden, not deleted, so old weeks keep their names.
- The **yearly balance**: per person, the mornings, afternoons, openings, closings and reserve
  days so far this kindergarten year, and how far each is from an even share.

**Távollétek (absences)**

- A person × day grid with a **Hónap | Hét** switch. The week view shows one week's working days
  in wide cells, and its week is shared with the Beosztás tab.
- Click, or drag along a row, to paint an absence. There are three kinds: _Szabadság_ (leave),
  _Beteg_ (sick) and _Egyéb_ (other). Each kind is a coloured bar with a letter.
- Next to each name, the leave taken against the allowance plus days carried over.
- Today's column is outlined and school-break days are tinted.
- A _Távol_ row per role counts who is away, and turns orange when too few are left for the
  week's groups.

**Beosztás (roster)**

- A week at a time:
  - Day chips show each day's capacity. A day can be set to fewer groups or closed.
  - Groups can carry names.
  - **Számol** solves the week.
- **Warnings**, grouped by day and explained in plain Hungarian, with one-click fixes: run
  fewer groups that day, or call in someone who is away (people on leave before the sick).
  Hovering a warning highlights its cells.
- **Undo** for every fix, call-in, re-solve and swap. The cells the last change altered are
  outlined.
- **Swap two people** by clicking one name, then another on the same day. A swap that would break
  a rule is refused, with the reason.
- **A week in progress keeps its past.** Once a week has started, Számol asks:
  - _only the needed changes_, the default: the fewest people change, and a reserve on the same
    shift fills in first;
  - or _everything from today_.

  Either way, the days already over stay as they were.

- **Beteg lett… (got sick):** click a name, set the last sick day, and the week is recalculated
  with the fewest changes. The undo bar then lists whom to phone and what to tell them: people
  whose hours changed first, then those who only move group or key.
- Weeks that are over are archived: read-only, but still printable.

**Everywhere**

- Print (two A4 pages) and Excel export.
- File backup and restore.
- A light or dark theme.
- Works offline.
- One editing window at a time, so two open windows never overwrite each other.

## How it works

- **A static web app with the solver in the browser.** HiGHS, a mixed-integer programming solver
  compiled to WebAssembly, runs in a Web Worker. Staff data, sick leave included, never leaves her
  laptop.
- **Strict rules are constraints.** Every group gets a morning teacher, an afternoon teacher and a
  nanny; one nanny opens at 6:00 and another closes at 18:00; nobody opens or closes on every day.
  When staff are short, empty seats become explicit holes, so a roster always comes back.
- **Priorities are solved in order** (lexicographic optimisation), in seven stages:
  1. holes;
  2. substitutions;
  3. the worst fairness gap (mornings, openings, closings and reserve days, scaled by days
     worked);
  4. the total fairness gap;
  5. group switches;
  6. late-then-early turnarounds;
  7. a tie-break that hands a week's leftover unit to whoever is behind this kindergarten year.
- **A week in progress is re-planned, not replaced.** The days already over are fixed. In the
  default mode, three extra stages come before fairness: fewest people whose hours change, then
  fewest changed days (earlier days cost more), then fewest group or key moves.
- **Every compromise is explained** in Hungarian, some with a one-click fix, and each roster is
  checked against the strict rules again before it is shown.
- Works offline, prints on two A4 pages, exports to Excel with a hidden backup sheet, and keeps
  everything in IndexedDB plus file backups.

## Architecture

```
 DEVELOPER                      GITHUB                          USER'S BROWSER (Chrome/Edge)
 ─────────                      ──────                          ────────────────────────────
 code ── PR ──► main ──► Actions: typecheck, prettier,   ──►   Pages ──► first visit downloads the files
                         tests, vite build                               │
                         (deploy only when green)                        ▼
                                                           ┌─ Service worker: keeps a copy of every file ─┐
                                                           │  (app, CSS, solver .wasm) → works offline    │
                                                           └──────────────────────────────────────────────┘
                                                             Page (React UI)          Web Worker (2nd thread)
                                                             ├ Munkatársak            ├ HiGHS solver (.wasm)
                                                             ├ Távollétek    ──solve──► model → staged solve →
                                                             ├ Beosztás     ◄─roster── check → warnings
                                                             └ state ⇄ IndexedDB (one key)
                                                                   ⇄ backup files (.json / .xlsx)
```

### Hosting: static files only

The app is served by **GitHub Pages**, which only hands out files over HTTPS through GitHub's
CDN. No server code runs anywhere and there is no database, so staff data cannot reach a server:
only the built app is hosted. `vite build` produces:

- `index.html`;
- one JavaScript bundle of about 250 kB (React plus the app);
- a CSS file;
- the solver: `highs.wasm`, 3.5 MB;
- ExcelJS as a separate file, loaded only on export;
- `sw.js`, the service worker, plus the app manifest and icon.

File names carry a content hash (`index-DXu-9zAK.js`), so a changed file always gets a new name.

### First visit and offline use

The browser loads `index.html`, runs the app and registers the **service worker**: a script the
browser keeps beside the page, sitting between the page and the network. On its first run it
downloads every file on its list (about 4.7 MB, the solver included) into the browser's cache.
From then on every app file is answered from that cache, so the app opens instantly and works
with no internet at all, solving included. It can also be installed as a desktop app.

Workbox skips files over 2 MiB unless told otherwise, so the build raises that limit to 8 MB.
Without it the solver would silently be left out, and offline solving would break.

### Updates

1. A change is merged into `main` through a pull request.
2. GitHub Actions runs the typecheck, the prettier check, all tests and the build. If anything
   fails, nothing is deployed.
3. The site is updated within a couple of minutes.
4. The user is **one visit behind**. The next time the app opens, the browser notices a new
   version and downloads it in the background. That visit still shows the old version; the next
   one shows the new version. Nothing needs installing, and saved data carries over, migrated if
   its format changed.

### Data

- **What it is:** everything is one object, `AppState`:
  - staff, with any leave allowances;
  - absences, each of a kind;
  - per week: the group counts, day overrides, group labels and the saved roster.

  A saved roster also stores its fairness deltas; the yearly balance and the solver's tie-break
  add these up.

- **Changing it:** each click produces an _action_ (e.g. "mark Anna absent on Tuesday"). A pure
  function, the _reducer_, turns the old state plus that action into a new state.
- **Storage:** every change saves the whole state into **IndexedDB**, the browser's built-in
  database, under a single key, so it is never half-saved. The app also asks the browser to keep
  this data permanently.
- **Loading and migrations:** on each load the saved data passes through `migrate`, which
  upgrades data saved by older versions of the app (v1 absences become leave).
- **One window at a time:** a Web Lock lets one browser window edit. A second window offers to
  take over, and then reloads the saved state.
- **Backups:** _Mentés fájlba_ saves a `.json` file, and every Excel export also carries a very
  hidden sheet holding the full data. _Visszatöltés_ accepts either one. Nothing is ever sent
  anywhere.

### Solving

When the user presses _Számol_:

1. **Input:** the app collects the week's input: the active staff, that week's absences, the
   working days from the Hungarian calendar (holidays out, working Saturdays in) and the group
   counts.
2. **The worker:** it sends the input to a **Web Worker**, a second thread, so the page never
   freezes. A 180 s watchdog, longer than all stages together, replaces the worker if it hangs.
3. **The solver:** inside the worker runs **HiGHS**, an open-source C++ optimisation solver
   compiled to WebAssembly. It is loaded once and reused.
4. **The model** (`src/core/model.ts`):
   - It turns the week into a _mixed-integer program_: hundreds of yes/no variables such as
     "Anna works the morning shift on Tuesday", "Anna holds group 2's morning teacher seat" or
     "Kati opens on Tuesday".
   - The rules become hard constraints: one shift a day, two teacher seats and a nanny seat per
     group, one opener and one closer a day, and so on.
   - Empty seats are explicit "hole" variables, so a solution always exists even on a
     short-staffed day. `g_max` caps the groups a day can actually start.
5. **Seven stages, in strict priority order:** fewest holes → fewest substitutions → the worst
   person's fairness gap → the total gap → fewest group switches → fewest turnarounds → the
   yearly tie-break.
   - After each stage its best value is locked in as a new rule, so a later stage can only choose
     among rosters that are equally good on everything before it.
   - Each stage gets 15 s (a week needs about 3 s in all). A stage that runs out of time keeps the
     best roster found so far — marked, so the screen suggests solving again — and
     only if HiGHS actually found one (a finite objective).
   - A later stage can never really be infeasible, because the previous stage's roster meets
     every bound. If HiGHS says it is anyway, that is its presolve misjudging a fairness bound
     that leaves 1e-6 of room (seen on real data). The stage is then solved again without
     presolve.
   - Fixed solver settings make the same input always give the same roster.
   - **In a week in progress** the saved roster travels along as an _anchor_ (`src/core/recalc.ts`):
     - The past days' variables are pinned to it.
     - In the fewest-changes mode, three stability stages (people, days, duties) go in right after
       substitutions, so the solve can take up to ten stages.
     - Who worked a past day is read from the anchor, so an absence typed in afterwards can't
       rewrite it.
6. **Decode:** the solution is turned back into a roster: who works which shift, in which seat,
   and who opens or closes.
7. **Check:** `validateRoster` re-checks every hard rule independently of the model. A roster
   that fails is never shown; the user sees an error message instead.
8. **Explain:** `explain` writes the Hungarian warnings (red, orange, grey), some with a
   one-click fix such as _Szerdán 1 csoport_.
9. **Save:** the roster is saved with a fingerprint of its input and its fairness deltas. If
   staff, absences or group counts change later, the screen says the roster is out of date.

Hand swaps don't use the solver. `src/core/edit.ts` exchanges two people's day, then runs the
result through the same check and explain steps. A swap that breaks a rule is refused with the
reason.

### Output

A single module (`src/export/views.ts`) turns a roster into the two tables: the group view and
the person view. Three things draw from it:

- the table on screen;
- the **print view**, where a print stylesheet lays out two A4 landscape pages with the legend
  and footnotes;
- the **Excel export**, built by ExcelJS, which loads only when the user exports.

### Code map

| Path                | What                                                                           |
| ------------------- | ------------------------------------------------------------------------------ |
| `src/core`          | pure logic: calendar, capacity, model, solver, checks, warnings (also in Node) |
| `src/state`         | app data, storage, migrations, backups                                         |
| `src/worker`        | the solver thread                                                              |
| `src/ui`, `src/app` | the screens                                                                    |
| `src/export`        | the views and the Excel export                                                 |
| `src/i18n/hu.ts`    | every Hungarian text                                                           |
| `src/demo`          | the invented demo kindergarten                                                 |
| `tests/`            | the tests, mirroring `src/` and `scripts/`                                     |
| `scripts/`          | `npm run slice`: solve a transcribed week from the command line                |

### Safety nets

- An independent check of every hard rule after every solve.
- A property test on random weeks: 25 per `npm test`, `PROPERTY_RUNS=300` for a deep run.
- A golden test on a real week, which runs only where the gitignored `data/` exists.
- UI tests for every screen.
- CI that refuses to deploy anything red.

## Development

```bash
npm install
npm test          # unit, property and UI tests
npm run dev       # the app on http://localhost:5173
npm run slice     # solve data/aug24.json from the command line (data/ is gitignored)
npm run build     # production build in dist/
```

Design: [docs/spec.md](docs/spec.md) · Feature designs: [docs/specs/](docs/specs/) ·
Implementation plans: [docs/plans/](docs/plans/)
