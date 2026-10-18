# kindergarten-roster

A break-week staff roster for one kindergarten. The head of staff enters the staff list, the
absences and the number of groups; the app produces a fair Monday–Friday roster she can print and
post. By hand it took her three to four hours per school break.

**Demo:** https://gjanos.github.io/kindergarten-roster/ — choose _Bemutató adatok_ (invented
people).

## What she can do

Four tabs, all in Hungarian.

**Munkatársak (staff)**

- The staff list in four sections: teachers, nannies, _pedagógiai asszisztensek_ (teacher's
  helpers) and _civilek_. Each person has the short name that appears on the wall, a yearly leave
  allowance, the days carried over into this year and the days left. A _Munkakör_ list moves
  someone to another role. Someone who has left is hidden, not deleted, so old weeks keep their names.
  Teachers and nannies sit side by side, the helpers on a row of their own below.

**Távollétek (absences)**

- A person × day grid with a **Hónap | Hét** switch. The week view shows one week's working days
  in wide cells, and its week is shared with the Beosztás tab.
- Click, or drag along a row, to paint an absence. There are three kinds: _Szabadság_ (leave),
  _Beteg_ (sick) and _Egyéb_ (other). Each kind is a coloured bar with a letter.
- Next to each name, the leave days left this calendar year (allowance plus days carried over,
  minus leave taken), or how far over.
- **Havi kimutatás** (month view): per person, the month's days away by kind, the dates and the
  leave left at month end, in place of the grid. It prints on one A4 portrait page for the
  accountant.
- Today's column is outlined and school-break days are tinted.
- A _Távol_ row per role counts who is away. For teachers and nannies it turns orange when too
  few are left for the week's groups, counting the helpers who can stand in. Hovering an orange
  cell says how many are left and how many are needed, so a mark caused by a helper's absence
  makes sense.

**Beosztás (roster)**

- A week at a time:
  - Day chips show each day's capacity. A day can be set to fewer groups or closed.
  - Groups can carry names.
  - **Számol** solves the week.
- **Warnings**, grouped by day and explained in plain Hungarian, with quick fixes: run fewer
  groups that day, or call in someone who is away (people on leave before the sick). She picks
  as many as she needs, each day card estimates what they leave (_→ várhatóan rendben_), and
  one _Alkalmaz és újraszámol_ applies them all in a single solve and a single undo step.
  Hovering a warning highlights its cells.
- **Undo** for every fix, call-in, re-solve and swap. The cells the last change altered are
  outlined.
- **Swap two people** by clicking one name, then another on the same day. A swap that would break
  a rule is refused, with the reason.
- **Helpers.** An asszisztens works 8–16 beside a group's DE teacher, or 10–18 in the DU teacher
  seat when a teacher is missing. A civil floats on 8–16, or takes a missing nanny's seat on 6–14
  or 10–18, before any teacher would. A warning says why someone's hours moved. Clicking a
  helper offers 8–16 / 6–14 / 10–18 by hand, with undo, like a swap.
- **A week in progress keeps its past.** Once a week has started, Számol asks:
  - _only the needed changes_, the default: the fewest people change, and a reserve on the same
    shift fills in first;
  - or _everything from today_.

  Either way, the days already over stay as they were.

- **Beteg lett… (got sick):** click a name, set the last sick day, and the week is recalculated
  with the fewest changes. The undo bar then lists whom to phone and what to tell them: people
  whose hours changed first, then those who only move group or key.
- Weeks that are over are archived: read-only, but still printable.

**Egyenleg (yearly balance)**

- Per person, the mornings, afternoons, openings, closings, reserve and ügyelet days this
  kindergarten year, weeks planned ahead included, and how far each is from an even share. Its own
  tab since 2026-10-18, so it is one click away instead of folded under the staff list.

**Everywhere**

- Print (two A4 pages) and Excel export.
- File backup and restore.
- **Automatic backup** (Chrome and Edge): she switches it on in the footer and picks a folder.
  Every 5 / 10 / 15 / 30 minutes, if something changed, the app writes the day's backup
  (`ovoda-mentes-YYYY-MM-DD.json`) there, and again when the tab is hidden or closed. One file a
  day, earlier days kept. If the browser wants the folder allowed again after a restart, the footer
  turns orange until she clicks; it never stops in silence. The demo never autosaves.
- A light or dark theme.
- Works offline.
- One editing window at a time, so two open windows never overwrite each other.

## How it works

- **A static web app with the solver in the browser.** HiGHS, a mixed-integer programming solver
  compiled to WebAssembly, runs in a Web Worker. Staff data, sick leave included, never leaves her
  laptop.
- **Strict rules are constraints.** Every group gets a morning teacher, an afternoon teacher and a
  nanny; one nanny opens at 6:00 and another closes at 18:00; nobody opens or closes on every day.
  Every day one group is on **ügyelet**: its two teachers work 30 minutes earlier (DE, from 6:30)
  and later (DU, until 17:30), at the same length.
  When staff are short, empty seats become explicit holes, so a roster always comes back.
- **Helpers stand in only to fill a seat.** An asszisztens can take a DU teacher seat (never a
  DE one, so a group always keeps a real teacher), a civil a nanny seat. Both stay on 8–16
  otherwise, and both are outside every fairness count, the yearly balance and the DE/DU balance.
- **Priorities are solved in order** (lexicographic optimisation), in twelve stages:
  1. holes (a missing ügyelet included);
  2. substitutions: a civil or asszisztens stand-in costs 1, a teacher as nanny 3;
  3. helpers: an asszisztens on 8–16 sits beside a group;
  4. nanny pairs: in groups 1–2, 3–4… one nanny works DE and the other DU;
  5. the worst fairness gap (mornings, reserve days and ügyelet days, scaled by days worked);
  6. the total fairness gap;
  7. the daily balance: per role, reserves included, DE and DU at most one apart;
  8. group switches;
  9. late-then-early turnarounds;
  10. openers and closers from seated nannies, not reserve ones;
  11. an even split of openings and closings (minor to her: the hours are the same either way);
  12. a tie-break that hands a week's leftover unit to whoever is behind this kindergarten year.
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
   freezes. An 8-minute watchdog, longer than all stages together, replaces the worker if it hangs.
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
5. **Twelve stages, in strict priority order:** fewest holes → fewest substitutions (civils
   before teachers) → asszisztens beside a group → nanny pairs → the worst person's fairness gap →
   the total gap → the daily DE/DU balance → fewest group switches → fewest turnarounds → keys
   from seated nannies → the key split → the yearly tie-break.
   - After each stage its best value is locked in as a new rule, so a later stage can only choose
     among rosters that are equally good on everything before it.
   - Each stage gets 30 s. Her real weeks need 10–25 s in all, and she is fine waiting a minute or
     more. A stage that runs out of time keeps the
     best roster found so far (if HiGHS found none, the previous stage's), locks in what that
     roster reached and lets the later stages run; the screen names the stage that ran out.
   - The two tie-breaks (the key split and the yearly balance) get 20 s, and running out of them is
     not shown. HiGHS finds their roster in seconds but often can't prove it the best: the yearly
     one not even in 15 minutes on a 6-group week, the keys not in 30 s on the demo week.
   - The fairness stages get a proven floor, the smallest gap whole counts allow, so they stop as
     soon as they reach it instead of proving it for the whole time limit.
   - A later stage can never really be infeasible, because the previous stage's roster meets
     every bound. If HiGHS says it is anyway, that is its presolve misjudging a fairness bound
     that leaves 1e-6 of room (seen on real data). The stage is then solved again without
     presolve.
   - Fixed solver settings make the same input always give the same roster.
   - **In a week in progress** the saved roster travels along as an _anchor_ (`src/core/recalc.ts`):
     - The past days' variables are pinned to it.
     - In the fewest-changes mode, three stability stages (people, days, duties) go in right after
       substitutions, so the solve can take up to fifteen stages.
     - Who worked a past day is read from the anchor, so an absence typed in afterwards can't
       rewrite it.
6. **Decode:** the solution is turned back into a roster: who works which shift, in which seat,
   and who opens or closes.
7. **Check:** `validateRoster` re-checks every hard rule independently of the model. A roster
   that fails is never shown; the user sees an error message instead.
8. **Explain:** `explain` writes the Hungarian warnings (red, orange, grey), some with a
   quick fix such as _Szerdán 1 csoport_.
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
