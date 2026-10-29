# kindergarten-roster

A break-week staff roster for one kindergarten, a gift for the user's mother (the head of staff)
and a portfolio piece. Static React + TypeScript web app; HiGHS (MILP, compiled to WASM) solves
in the browser, so staff data never leaves her laptop. The UI is Hungarian. `README.md` describes
what she can do; the design is `docs/spec.md`, later versions in `docs/specs/`, plans in `docs/plans/`.

## Rules

- **Real names live only in the gitignored `data/`.** Tests, the demo and docs use invented people.
- The repo is public; CI (`.github/workflows/ci.yml`) deploys GitHub Pages from a green `main`.
- Tests live in `tests/`, mirroring `src/`, never next to the code.
- `npm test` (vitest), `npm run typecheck`, `npm run format:check` (Prettier); `npm run dev` serves it.
- `roster-engine` (a sibling repo) is its successor; this app stays as it is until a migration is cheap.

## Map

<!-- map:start deep="src" -->

| Path          | What                                                                                          | Go here when                                  |
| ------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------- |
| `src/core/`   | the model: calendar, capacity, fairness, the LP built for HiGHS, metrics, edits, explanations | how the roster is computed, a rule, a warning |
| `src/worker/` | the solver web worker and its protocol                                                        | the solve itself, solver timing               |
| `src/state/`  | app state, autosave, backups, undo history, leave, sick calls, month report, migrations       | saving, loading, undo, data shape changes     |
| `src/ui/`     | the screens and controls (staff, absences, roster, dock)                                      | anything on screen                            |
| `src/app/`    | `App.tsx`, the app and print styles, the single-window guard                                  | layout, printing                              |
| `src/export/` | the printable views and the xlsx export                                                       | output files                                  |
| `src/i18n/`   | the Hungarian strings                                                                         | wording                                       |
| `src/demo/`   | the invented demo data (Bemutató adatok)                                                      | the demo                                      |
| `tests/`      | vitest, mirroring `src/`                                                                      | any change                                    |
| `docs/`       | `docs/spec.md`, `docs/specs/` and `docs/plans/`, dated                                        | why it works this way                         |
| `scripts/`    | the slice tool (`npm run slice`) and week-timing helpers                                      | running the model outside the app             |
| `public/`     | static assets (the icon)                                                                      | the icon                                      |

<!-- map:end -->
