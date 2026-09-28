# kindergarten-roster — design spec

Status: **approved design, 2026-09-26. Scope frozen.** New edge cases go to the v2 list (§13), not
into the model.

## 1. Purpose

A break-week staff roster tool for one kindergarten. During school breaks (4 a year) the head of
staff builds a Monday–Friday roster by hand: which teachers and nannies work mornings or
afternoons, in which group, who opens and who closes. It takes her 3–4 hours per break. This app
takes her staff list, the absences and the number of groups, and produces a fair roster she can
print and post.

**The user:** one person, not confident with computers, learns through a few live demos. The UI
is Hungarian, large, and forgiving. Everything in code is English.

**Secondary goal:** a presentable portfolio piece. The same URL serves a demo with invented data.

**Deadline:** v1 in her hands by **2026-10-20**, before the autumn break.

## 2. Domain

### Glossary

| Hungarian (UI) | Code |
| --- | --- |
| óvónő / dajka | `teacher` / `nanny` |
| délelőtt (DE) / délután (DU) | `morning` / `afternoon` |
| nyit / zár | `opener` / `closer` |
| csoport / csoporton kívül (tartalék) | `group` / `reserve` |
| távollét | `absence` |
| beosztás | `roster` |
| betöltetlen | `hole` |
| helyettesítés | `substitution` |
| ledolgozós szombat | working Saturday |
| nevelési év (Sep 1 – Aug 31) | kindergarten year |

### Shifts — fixed, not a menu

| Role | Morning | Afternoon | Hours |
| --- | --- | --- | --- |
| Teacher | 7:00–13:30 (Fri 7:00–13:00) | 10:30–17:00 (Fri 11:00–17:00) | 6.5 h, Fri 6 h |
| Nanny | 6:00–14:00 | 10:00–18:00 | 8 h |

A working Saturday uses the Friday times (confirmed). Hours are never optimised; they follow
from the shift. **Shift times are never stretched** — her rule: time limits are always kept.

### Her rules (gathered 2026-09-22/23)

- Each open group needs **1 morning teacher, 1 afternoon teacher, 1 nanny** (either shift).
- Everyone present but not seated is **reserve**: at work, on a normal morning or afternoon shift.
- **One opener and one closer per day, for the whole kindergarten** (not per group). The opener is
  a morning nanny, the closer an afternoon nanny. A nanny never does both (6:00–18:00 > 8 h).
- **Nobody opens, or closes, on every working day of the period.**
- **As equal as possible** — within the period first, across the kindergarten year second. When a
  period can't be perfectly equal, the less favourable share goes to whoever has had it better this
  year.
- **Same group all period** — soft.
- **Group count fixed for the period** (a per-day override exists for shortages, §6.6).
- No personal requests, no pairing rules, no ügyelet.
- Good enough = a working roster that respects absences and the rules above.

## 3. Scope

**v1 (by 2026-10-20):** staff, absences, roster screens; the full model including shortage mode;
warnings; print; Excel export; backup/restore; offline; demo data; deploy.

**v2 (before the winter break):** recalculation after a sick call; yearly balance; hand editing
(design undecided — may be much simpler than a full editor); richer absences. See §13.

**Out:** logins, servers, multi-tenant, personal requests, ügyelet.

## 4. Architecture

**A static web app; the solver runs in her browser.** No server code, no database, no login.
She opens a desktop shortcut → Chrome/Edge → the app. After the first visit it works offline.

| Concern | Choice |
| --- | --- |
| UI | React + TypeScript + Vite |
| Solver | HiGHS (MILP) compiled to WASM, `highs` npm package, in a Web Worker |
| Storage | IndexedDB via `idb-keyval`, `navigator.storage.persist()` |
| Export | ExcelJS; browser print with a print stylesheet |
| Offline | `vite-plugin-pwa` (caches the app and the `.wasm`) |
| Tests | vitest |
| Hosting | GitHub Pages (or Cloudflare Pages), a subdomain; deploy only on green CI |

**Why:** personal data — including sick leave, a GDPR special category — never leaves her laptop;
updates are a `git push`; no installer, no unsigned exe, no SmartScreen or Defender trouble; the
portfolio demo is the same build. **Accepted trade-off:** HiGHS instead of CP-SAT — the same optimal
roster at this size, clunkier modelling.

### Modules

```
src/core/types.ts        domain types (§5)
src/core/calendar.ts     working days of a period, holidays, working Saturdays
src/core/capacity.ts     per-day headcount, g_max, effective group count (§6.6)
src/core/model.ts        input → MILP (LP text); pure
src/core/solve.ts        staged solve with HiGHS → Roster (§6.5)
src/core/validate.ts     validateRoster(input, roster) → Violation[]  (strict rules; a hit is a bug)
src/core/explain.ts      explain(input, roster) → Warning[]           (what was relaxed, §7)
src/worker/solver.ts     Web Worker wrapper, 10 s timeout
src/state/               AppState, persistence, migrations, backup/restore (§9)
src/ui/                  screens (§8), Hungarian strings in one file
src/export/xlsx.ts       Excel export incl. hidden backup sheet
src/export/print.css     print layout
scripts/slice.ts         MVP slice runner (§12)
data/                    gitignored — real names live only here
```

**Boundaries:** `core/` is pure TypeScript with no React and no browser APIs, so it runs in Node
(slice, tests) and in the worker unchanged. `explain` reads only the finished roster — never
solver internals — so v2 hand edits get the same warnings for free.

**Entry point:** `solve(input: SolveInput): Roster`, where `SolveInput` carries staff, absences,
period, group counts, and (v2) `locked` cells and the `previous` roster.

## 5. Data types

```ts
type Role = 'teacher' | 'nanny'
type Shift = 'morning' | 'afternoon'

type Staff = { id: string; fullName: string; displayName: string; role: Role; active: boolean }
type Absence = { staffId: string; date: string }           // ISO date, one row per absent day

type Period = { start: string; days: string[] }             // working days only, 1–6 of them
type DayPlan = { date: string; requestedGroups: number; override?: number }  // override 0 = closed

type Seat =
  | { kind: 'teacher'; group: number; shift: Shift }
  | { kind: 'nanny'; group: number }

type Assignment = {
  staffId: string; date: string; shift: Shift
  seat?: Seat                                               // absent seat = reserve
  substitution?: true                                       // teacher in a nanny seat
  opener?: true; closer?: true
}

type Roster = {
  period: Period
  groupsPerDay: Record<string, number>                      // effective count after g_max/override
  assignments: Assignment[]
  holes: Hole[]
  warnings: Warning[]
  solvedAt: string; appVersion: string
}

type Hole =
  | { kind: 'teacherSeat'; date: string; group: number; shift: Shift }
  | { kind: 'opener' | 'closer'; date: string }

type Warning = {
  code: WarningCode                                         // §7
  severity: 'red' | 'orange' | 'grey'
  date: string
  text: string                                              // Hungarian, ready to show
  action?: string                                           // Hungarian suggestion
  fix?: { kind: 'setGroups'; date: string; groups: number } // one-click button
  cells: { staffId?: string; date: string; group?: number }[]  // for hover highlight
}
```

People are referenced by `id`, never by name, so renaming never breaks history.

## 6. The model

### 6.1 Variables (all 0/1)

| Variable | Meaning |
| --- | --- |
| `s[p,d,t]` | person p works shift t on day d |
| `x[p,d,g,t]` | teacher p holds group g's shift-t teacher seat on day d |
| `n[p,d,g]` | nanny p holds group g's nanny seat on day d |
| `sub[p,d,g]` | teacher p holds group g's nanny seat on day d (substitution) |
| `open[p,d]`, `close[p,d]` | nanny p opens / closes on day d |
| `holeT[d,g,t]` | group g's shift-t teacher seat is empty on day d |
| `holeOpen[d]`, `holeClose[d]` | nobody opens / closes on day d |

Reserve is not a variable: working with no seat = reserve.

### 6.2 Strict rules — never relaxed

```
s[p,d,morning] + s[p,d,afternoon] = 1 − absent[p,d]          present ⇒ exactly one shift
Σg x[p,d,g,t] ≤ s[p,d,t]                                      teacher seat only on own shift
(all seats of p on day d: x, n, sub) ≤ 1 − absent[p,d]        at most one seat a day
Σ(teachers) x[p,d,g,t] + holeT[d,g,t] = 1                     each teacher seat: a person or a hole
holeT[d,g,morning] + holeT[d,g,afternoon] ≤ 1                 group minimum: ≥ 1 teacher
Σ(nannies) n[p,d,g] + Σ(teachers) sub[p,d,g] = 1              nanny seat always filled
open[p,d] ≤ s[p,d,morning],  close[p,d] ≤ s[p,d,afternoon]    nannies only
Σp open[p,d] + holeOpen[d] = 1,  same for close
Σd open[p,d] ≤ |D| − 1,  same for close                       only when |D| ≥ 2
```

Substitutes work their own teacher shift times and never open or close — teacher times reach
neither 6:00 nor 18:00. A nanny never takes a teacher seat. Nobody opens and closes on the same
day: opening needs a morning shift, closing an afternoon shift, and a person works one shift.

Groups exist only up to the day's effective count (§6.6), which makes the strict rules always
satisfiable: **the solver always returns a roster.**

### 6.3 Fairness — ratio-based equality

For each person, four counts over the period: **morning shifts, opener days, closer days, reserve
days** (opener/closer for nannies only). Each has a fair share scaled by days actually worked:

- morning shifts: `w[p] / 2`
- opener, closer: the period's openings split among nannies by their share of nanny working days
- reserve days: the role's reserve days split by share of working days within the role

`gap = |count − share|`, linearised with a helper variable: `gap ≥ count − share`,
`gap ≥ share − count`. The model never decides whether morning or reserve is "nicer" — it only
balances counts.

### 6.4 Group switches and turnarounds

- **Switch:** person in group g today, in some other group tomorrow:
  `switch ≥ inGroup_g(today) + inAnyGroup(tomorrow) − inGroup_g(tomorrow) − 1`.
  A reserve day breaks the chain. Counting switches (not distinct groups used) avoids rewarding
  reserve.
- **Turnaround:** a nanny on afternoon (until 18:00) then morning (from 6:00) the next day.
  12 h rest — legal, but a comfort penalty.

### 6.5 Staged solve — priorities in strict order

Each stage's optimum becomes a constraint (plus a tiny float tolerance) for the next, so a later
stage only chooses among rosters tied on every earlier one. Weighted sums were rejected: enough
switches can outweigh a fairness gain.

1. **Holes** — minimise empty teacher seats plus missing openers/closers.
2. **Substitutions** — minimise teachers in nanny seats. A substitution happens only when it
   removes a hole.
3. **Worst gap** — minimise the largest single person's gap → M\*. Nobody gets a clearly bad
   period.
4. **Total gap** — with every gap ≤ M\*, minimise the sum → E\*.
5. **Group switches** — keep people in the same room.
6. **Turnarounds.**
7. **Yearly balance** — the tie-break of last resort. Each roster stores its fairness deltas
   (`count − share` per person and count); the kindergarten year's earlier rosters (Sep 1 onwards,
   by the week's Monday) are summed into `SolveInput.history`, and this stage minimises
   `Σ history × count`, so the rounded-up unit goes to whoever is behind this year. Rosters saved
   before v2 have no deltas and count as zero. The history is not part of the input fingerprint.

**A week in progress** (v2-F, `docs/specs/2026-09-28-sick-call-design.md`) is solved with an
anchor, the saved roster. The days before `from` (the first working day that is today or later)
are fixed as planned; who worked them is read from the anchor, not from absences typed since. In
the default *minimal* mode three stages come right after substitutions:

- **keepPeople**: people whose hours change.
- **keepHours**: their changed days, an earlier day costing more.
- **keepDuties**: seat and key moves at unchanged hours.

So a reserve on the same shift fills in first, and stability beats fairness; the yearly balance
evens out the difference. *Full* mode keeps only the fixed past. Without an anchor these stages are
empty and skipped, so an ordinary solve is unchanged.

Six solves of ~500 binaries take milliseconds. HiGHS runs with a **fixed seed**: the same input
gives the same roster every time.

### 6.6 Capacity, periods and shortages

**Zero-hole capacity:** a day needs `2 × groups` teachers and `max(groups, 2)` nannies.

**Groups a day can start** (T teachers, N nannies present):

```
g_max = min(T, ⌊(T + N) / 2⌋)
```

Each group needs its own teacher, and every nanny seat a nanny or a spare teacher.
**Effective count** = the day's override if set, else `min(requested, g_max)`. When it's below the
request, the highest-numbered groups merge into the lower ones and the day is flagged.
`g_max = 0` (no teacher) → the day is empty and flagged "call someone in". Days where only nannies
work get no special handling beyond that flag.

**Default on a short day:** keep her group count as far as the group minimum allows, flag the holes
red, and offer one click to reduce the day (**[Szerdán 1 csoport]**). The app never silently takes
a group away. Override 0 = closed day.

**A lone nanny** covers one key; the other is a hole by necessity (the fix — someone comes early,
the kindergarten opens later — is human).

**Periods, not weeks:** 1–6 working days. Holidays shrink a period, a working Saturday grows it.
Cross-day rules are defined over the period's working days; "not every day" applies only when
`|D| ≥ 2`.

## 7. Warnings — `explain(input, roster)`

Every relaxation is flagged, visually and in words. Severity: **red** = someone must act,
**orange** = compromise made, roster valid, **grey** = information. Red and orange print as
footnotes (the wall shows a forced choice, not a bug); grey stays on screen.

| Code | Sev. | Trigger | UI text (example) | Suggested action |
| --- | --- | --- | --- | --- |
| `NO_TEACHER` | red | `g_max = 0` | *Szerdán nincs óvónő — egy csoport sem indítható.* | *Hívj be valakit: Anna, Bea (távol).* |
| `TEACHER_SEAT_EMPTY` | red | a group has only 1 teacher | *Szerda, 2. cs.: nincs délutános óvónő (10:30–17:00).* | *Hívj be valakit, vagy vond össze a csoportot.* + **[Szerdán 1 csoport]** |
| `OPENER_MISSING` / `CLOSER_MISSING` | red | no nanny on that shift | *Szerdán nincs nyitó — csak 1 dajka dolgozik.* | *Valaki jöjjön 6:00-ra, vagy nyisson később az óvoda.* |
| `GROUPS_REDUCED` | orange | effective < requested (g_max) | *Szerdán 1 csoport indul 2 helyett (3 óvónő, 1 dajka). A 2. cs. összevonva az 1.-vel.* | — |
| `GROUPS_OVERRIDDEN` | orange | she set the day by hand | *Szerda: 1 csoport (kézi beállítás).* | — |
| `SUBSTITUTION` | orange | teacher in a nanny seat | *Szerda, 1. cs.: dajka helyett óvónő — Cili.* | — |
| `CLOSED_DAY` | orange | 0 groups | *Szerdán zárva.* | — |
| `GROUP_SWITCH` | grey | a switch survived stage 5 | *Dalma csütörtökön az 1. csoportból a 2. csoportba kerül.* | — |
| `TURNAROUND` | grey | nanny afternoon → morning | *Nóra kedden 18:00-ig, szerdán 6:00-tól.* | — |
| `UNEVEN` | grey | someone's gap ≥ 1 after stage 4 | *Egyenlő elosztás nem volt lehetséges: Nóra 3 délutános műszak az 5-ből.* | — ; adds *"Idén eddig 2 délutánnal több jutott neki."* when the year is ≥ 1 day off |

The panel sits above the result, ordered by day then severity; the Beosztás tab shows a count
badge; hovering a warning highlights its cells. Warnings are saved with the roster. Wording is
tested with her at the demo.

Names inside warning texts are stored as references (the staff id between `` and ``)
and resolved to the current display name on screen, in print and in the Excel footnotes, so a
rename reaches rosters saved before it. Texts saved before v2 hold plain names and show as they are.

## 8. UI — Hungarian, large

Base text 16 px, buttons ≥ 38 px (the main actions 46 px); light and dark theme, following the
system until she picks one with the ☾ / ☀ button (remembered; the printout is always light). Three tabs: **Munkatársak · Távollétek · Beosztás**. Footer on
every screen: *"Utolsó mentés: 3 napja"* + **Mentés fájlba**, orange after 7 days without a backup.
First launch: **Új kezdés · Visszatöltés fájlból · Bemutató adatok**; demo mode shows a
*"Bemutató adatok — nem valódi személyek"* banner.

### 8.1 Munkatársak

Two columns side by side, **Óvónők** and **Dajkák** (stacked on a narrow screen), each with its own
**+ Új óvónő / + Új dajka**. Row: full name, display name (defaults to the full name; she may
shorten it; warn on duplicates), active, a **→ Dajka / → Óvónő** move button, **Törlés**. Inline
edit; inactive people sink to the bottom, greyed. A collapsed **ⓘ Tudnivalók** legend explains
Aktív, Törlés and the display name.
**Deactivation is advised, deletion allowed:** long leave comes back, so the confirm dialog for
someone already rostered recommends unticking Aktív instead. Deleting them anyway hides them
(`deleted: true`, inactive) but keeps the record, so past rosters keep the name. Someone never
rostered is deleted outright.

**Éves egyenleg (2026/27)** — a folded table at the bottom: per person the year's mornings,
afternoons, openings, closings and reserve days from the saved rosters, each with its difference
from an equal share, e.g. *12 (+1,5)*.

**Szabadság/év** — optional yearly leave allowance in days (empty = not tracked).

### 8.2 Távollétek

Month grid, people × days (teachers, then nannies), ◀ ▶ between months. Click a cell, or drag
along a row, to mark an absence. Weekends and holidays greyed and not clickable; a working Saturday
shows as a working day. Holidays and working Saturdays are a hard-coded list per kindergarten year,
updated yearly by a push.

**Three kinds** — *Szabadság, Beteg, Egyéb* — picked above the grid; clicking or dragging paints
the chosen kind, clicking a day of that kind clears it, another kind is repainted. Bars carry the
kind in colour (green, orange, grey) and a letter (*Sz, B, E*). For people with an allowance, the
name shows *"kivett / keret"* for the shown month's calendar year (allowance + carry-over, orange
when over); clicking it opens the year's *Áthozott napok* field. The solver ignores the kind.
Call-in suggestions list people on leave first and the sick last, marked *(beteg)*. The person view
of the printout says *szabadság / beteg / távol*.

At a glance: today's column is outlined, school-break days have a tinted header, a *Távol* row
under each role counts who is away (orange when fewer are left than the week's group count needs
for zero holes), the name column stays put while the grid scrolls, and **Ma** jumps back to the
current month.

### 8.3 Beosztás

```
 Hét:  ◀  2026. október 26 – 30  ▶        Csoportok:  [−] 2 [+]
  H ✓   K ✓   Sz ⚠ csak 3 óvónő — 2 csoporthoz 4 kell   Cs ✓   P ✓
                          [ Számol ]
 ── Figyelmeztetések (2) ─────────────────────────────────
 ── result grid (the printout's group view) ──────────────
                 [ Nyomtatás ]   [ Excel letöltés ]
```

- The week picker opens on the next break week; weeks with a saved roster show a dot.
- Optional group labels (*"1. cs. – Pillangó, Süni, Mókus"*).
- The capacity row updates live and **warns, never blocks**: Számol always works.
- Per-day override from a warning's button or by clicking a day header.
- Warnings: one card per day on a single row, red before orange, each fix once. One-click fixes:
  **Hétfőn 2 csoport** (reduce the day) and **Emese mégis jön** (clear an absence that would fix
  it); both solve again at once. Grey notes fold into *Egyéb megjegyzések*.
- An outdated roster (input changed since solving) is greyed under a sticky banner with its own
  **Újraszámol** button.
- **Undo:** after a fix, a call-in or a re-solve, a bar names the change, counts the table cells it
  altered (outlined in the table) and offers **↶ Visszavonás** / **Rendben**. Undo puts back only
  what the change touched — that day's input and the earlier roster — so later edits survive; up
  to 20 steps, in memory only, per week. Rendben keeps the week's changes and clears the marks.
- **Swap two people:** in an open, current roster she clicks a name, then another name on the
  same day; the two exchange shift, seat, opener and closer. The swap goes through
  `validateRoster` and `explain` like a solve: if a strict rule breaks, nothing changes and a line
  says why (*"Ez a csere nem lehetséges: dajka nem ülhet óvónői helyre."*). A swap is an undo step
  with its two cells marked; the roster is marked *kézzel módosítva*, and Számol or a quick fix asks
  before dropping hand edits. Same-day only; filling a hole stays with the call-in button.
- **A week in progress** (its first working day has come): Számol and Újraszámol first ask
  *"A hét már elkezdődött — a korábbi napok változatlanok maradnak."* with **Csak a szükséges
  változtatások** (default) or **Mától mindent újraszámol**. Quick fixes use the first without
  asking, and days already over get no fix buttons.
- **Beteg lett…**: a picked name on today or a later day offers it next to *Mégse*;
  *"Kati beteg keddtől — meddig?"* takes the last sick day, marks every working day up to it
  *beteg*, and recalculates with the fewest changes. The undo bar then lists whom to phone
  per person, only what changed: first those whose hours changed (*"… ideje változott — őket
  érdemes felhívni:"*, today's calls at the top), then those who only move group or key). Undo puts back
  the absences and the roster together.
- Every period's roster is saved (the yearly balance's history in v2).
- **A week that is over is archived** (the day after its last working day): an *Archív* badge, the saved
  roster and warnings read-only, print and Excel kept; no Számol, fixes, group counts or outdated
  banner, since re-solving history with today's staff would rewrite what happened. The week in
  progress stays open.

### 8.4 Output

- **Nyomtatás:** the browser print dialog from a print-styled page. One click.
- **Excel letöltés:** `beosztas-2026-10-26.xlsx`, editable, plus the full app data in a hidden
  sheet as a backup (split across rows — Excel caps a cell at 32,767 characters).

**Two A4 landscape pages:**

1. **Group view** — rows: each group, *Csoporton kívül – óvónő*, *Csoporton kívül – dajka*;
   columns: the days with dates. Opener/closer bold. Matches the sheet she already makes.
2. **Person view** — one row per person (teachers, then nannies), cells `DE · 1. cs.`,
   `DU · tartalék`, `távol`. Morning pale yellow, afternoon pale blue, absent grey.

Shift times printed once in a legend. Holes print as red **BETÖLTETLEN**, substitutions orange.
Red and orange warnings as footnotes.

## 9. Data and persistence

```ts
type AppState = {
  schemaVersion: 2
  staff: Staff[]
  absences: Absence[]
  periods: Record<string, { dayPlans: DayPlan[]; groupLabels?: string[]; roster?: Roster }>
  lastBackupAt?: string
}
```

v1 data migrates to v2 with every absence as leave.

- The whole state lives under **one IndexedDB key** — a few hundred KB after years; every save
  writes all of it, so there are no half-saved states.
- **One window edits at a time** (Web Locks): a second window shows *"Az alkalmazás egy másik
  ablakban már nyitva van."* with **Használat ebben az ablakban**, which takes over, stops the
  first window and reloads the saved state. Without Web Locks the app runs as before.
- `schemaVersion` + migrations run on every load and every restore, so old backups load in any
  newer version (updates reach her silently).
- **Mentés fájlba** writes `ovoda-mentes-2026-10-26.json`. **Visszatöltés** accepts that file or
  an exported Excel, after a confirmation: *"Ez felülírja a jelenlegi adatokat."*

## 10. Errors

| Situation | What she sees |
| --- | --- |
| Shortage | not an error: a roster with warnings (§7) |
| Solver or WASM fails to load, crashes, or exceeds 150 s (each stage stops itself at 15 s; a stage that does is noted on screen) | *"Hiba történt — frissítsd az oldalt."* The worker keeps the page responsive |
| `validateRoster` finds a violation (a bug) | *"Hiba történt a beosztás készítésekor."* — the roster is not shown or printed |
| Invalid restore file | rejected with a message; nothing changes |
| Persistent storage refused | the footer asks her to back up more often |

## 11. Testing

1. **`validateRoster`** checks every strict rule. Used by the tests and **run by the app after
   every solve** — a model bug never reaches the wall.
2. **Unit tests** — one per strict rule; the fairness example (4 nannies, one working 3 days, 5
   openings → she opens once); the switch table; same input → same roster; `g_max` table.
3. **Property test** — hundreds of random periods (1–6 days, random absences, 1–4 groups): every
   solve returns a roster that passes `validateRoster`; capacity OK ⇒ zero holes; every hole and
   every reduced day has a matching warning.
4. **Golden period** — the Aug 24–28 week as a snapshot test; local only (data gitignored).
5. **Excel smoke test** — the file opens and contains every display name.
6. **CI** — GitHub Actions runs the tests on every push; Pages deploys only when green.

## 12. Delivery

0. **MVP slice — before anything else.** `npm run slice` reads `data/aug24.json` (staff + absences
   transcribed from her Aug 24–28 sheet; absent = on the staff list, missing that day) → solver →
   `beosztas-2026-08-24.xlsx`. No UI, no hosting. Strict rules + fairness + switches (shortage mode
   comes forward only if that week turns out to need it). She judges the
   printout; tell her up front what differs by design (no ügyelet, no 8–16 reserve nanny, nobody
   opens and closes the same day). **Proceed only if she approves.**
1. **Core** — shortage mode, capacity, `explain`, property tests.
2. **App** — three screens, print, Excel, backup/restore, offline, demo data, deploy. **= v1.**
3. **Demo to her** — a live walkthrough, desktop shortcut, first backup together.

## 13. v2 list

Designed in `docs/specs/2026-09-27-v2-design.md`, one plan each in `docs/plans/2026-09-27-v2-*.md`
(A warning names · B swap · C yearly balance · D absence kinds · E month overview); all five landed
on 2026-09-27 and are described in the sections above. **F, the sick-call recalculation**
(`docs/specs/2026-09-28-sick-call-design.md`, `docs/plans/2026-09-28-v2-f-sick-call.md`), is
described in §6.5 and §8.3. Left: whatever her demo feedback adds.

## 14. Privacy and portfolio rules

- Her data never leaves her browser. Nothing is sent anywhere.
- **No real staff names, no children, no institution** in the repo, the demo, or screenshots
  without her written OK. Demo data is invented, not anonymised. `data/` is gitignored.
- CV line: *"Staff rostering web app (MILP constraint model solved in-browser with HiGHS, ~16 staff,
  5 groups) replacing a manual weekly roster."*
