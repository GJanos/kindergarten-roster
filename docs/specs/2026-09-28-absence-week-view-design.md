# kindergarten-roster — absence planner week view (v2-G)

Status: **agreed with the user, 2026-09-28.** Plan: `docs/plans/2026-09-28-v2-g-absence-week-view.md`.

## Problem

Távollétek shows one month: a person × day grid of up to 31 narrow columns. Planning a break week
means hunting for five of those columns, and the week she then rosters lives on another screen.

## What she sees

- A **[Hónap] [Hét]** switch at the start of the Távollétek bar.
- **Hét** is the same grid for one week's working days only (a working Saturday included), with
  wider cells and full day headers (*"Hétfő 10.26."*).
- In Hét, ◀ ▶ step a week (*Előző hét* / *Következő hét*), the title is the period
  (*"2026. október 26 – 30."*), and **Ma** jumps to the current week.
- Painting, dragging, the leave balances and the orange *Távol* coverage rows work exactly as in
  the month view.
- **The week is shared with Beosztás.** The week view shows the roster screen's week, and
  stepping here moves it there too. The flow is: mark this break week's absences, then roster
  it.
- Hét → Hónap opens the month containing the week's Monday.
- The chosen view survives switching tabs (it lives in `App`). After a reload it starts on
  Hónap.

## How it's built

- `AbsenceGrid` (new, `src/ui/AbsenceGrid.tsx`) holds the table that `AbsenceScreen` renders
  today, driven by a `days` list and a `wide` flag. The month view passes every day of the month;
  the week view passes `periodForWeek(week).days`. Bar joining, coverage and painting are
  unchanged, because they already work on any list of days.
- `AbsenceScreen` keeps the bar: the view switch, navigation for each view, and the kind
  buttons. It takes `week`, `onWeek`, `view` and `onView` from `App`, next to the `week` that
  `RosterScreen` already gets.
- `App` holds `absenceView: 'month' | 'week'` (default `'month'`).

## Decisions

- **Working days only in the week view:** weekends carry nothing to paint. The month view still
  shows them greyed, for orientation.
- **No change to the data or the solver.**
