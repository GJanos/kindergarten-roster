# kindergarten-roster

A break-week staff roster for one kindergarten. The head of staff enters the staff list, the
absences and the number of groups; the app produces a fair Monday–Friday roster she can print and
post. By hand it took her three to four hours per school break.

**Demo:** https://gjanos.github.io/kindergarten-roster/ — choose _Bemutató adatok_ (invented
people).

## How it works

- **A static web app with the solver in the browser.** HiGHS, a mixed-integer programming solver
  compiled to WebAssembly, runs in a Web Worker. Staff data, sick leave included, never leaves her
  laptop.
- **Strict rules are constraints.** Every group gets a morning teacher, an afternoon teacher and a
  nanny; one nanny opens at 6:00 and another closes at 18:00; nobody opens or closes on every day.
  When staff are short, empty seats become explicit holes, so a roster always comes back.
- **Priorities are solved in order** (lexicographic optimisation): holes, substitutions, the worst
  and then the total fairness gap (mornings, openings, closings and reserve days, scaled by days
  worked), group switches, and finally late-then-early turnarounds.
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
                                                             ├ Távollétek    ──solve──► model → 6 stages →
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

- **What it is:** everything is one object, `AppState`: staff, absences, and per week the group
  counts, day overrides, group labels and the saved roster.
- **Changing it:** each click produces an _action_ (e.g. "mark Anna absent on Tuesday"). A pure
  function, the _reducer_, turns the old state plus that action into a new state.
- **Storage:** every change saves the whole state into **IndexedDB**, the browser's built-in
  database, under a single key, so it is never half-saved. The app also asks the browser to keep
  this data permanently.
- **Loading and migrations:** on each load the saved data passes through `migrate`, which
  upgrades data saved by older versions of the app.
- **Backups:** _Mentés fájlba_ saves a `.json` file, and every Excel export also carries a very
  hidden sheet holding the full data. _Visszatöltés_ accepts either one. Nothing is ever sent
  anywhere.

### Solving

When the user presses _Számol_:

1. **Input:** the app collects the week's input: the active staff, that week's absences, the
   working days from the Hungarian calendar (holidays out, working Saturdays in) and the group
   counts.
2. **The worker:** it sends the input to a **Web Worker**, a second thread, so the page never
   freezes. A 150 s watchdog, longer than all stages together, replaces the worker if it hangs.
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
5. **Six stages, in strict priority order:** fewest holes → fewest substitutions → the worst
   person's fairness gap → the total gap → fewest group switches → fewest turnarounds.
   - After each stage its best value is locked in as a new rule, so a later stage can only choose
     among rosters that are equally good on everything before it.
   - Each stage gets 15 s (a week needs about 3 s in all). A stage that runs out of time keeps the
     best roster found so far — marked, so the screen suggests solving again — and
     only if HiGHS actually found one (a finite objective).
   - Fixed solver settings make the same input always give the same roster.
6. **Decode:** the solution is turned back into a roster: who works which shift, in which seat,
   and who opens or closes.
7. **Check:** `validateRoster` re-checks every hard rule independently of the model. A roster
   that fails is never shown; the user sees an error message instead.
8. **Explain:** `explain` writes the Hungarian warnings (red, orange, grey), some with a
   one-click fix such as _Szerdán 1 csoport_.
9. **Save:** the roster is saved with a fingerprint of its input. If staff, absences or group
   counts change later, the screen says the roster is out of date.

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

Design: [docs/spec.md](docs/spec.md) · Implementation plans: [docs/plans/](docs/plans/)
