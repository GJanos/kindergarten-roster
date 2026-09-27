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

## Development

```bash
npm install
npm test          # unit, property and UI tests
npm run dev       # the app on http://localhost:5173
npm run slice     # solve data/aug24.json from the command line (data/ is gitignored)
npm run build     # production build in dist/
```

Design: [docs/spec.md](docs/spec.md) · Implementation plans: [docs/plans/](docs/plans/)
