# kindergarten-roster — leave remaining + monthly absence report (v3-a)

Status: **agreed with the user, 2026-10-17**, from her feedback round after using the app. First of
three v3 parts (a → b → c). No solver or data change.

## Problem

1. The Távollétek balance reads `2 / 7` (taken / total). She thinks in **days left**, and she
   wants to see them on Munkatársak too, not only on Távollétek.
2. Each month the accountant needs who was away how many days, by kind. Today she counts the
   bars by hand.

## What she sees

**Days left instead of taken / total.**

- The balance button beside each name in Távollétek reads **`5 maradt`**. Over the allowance it
  reads **`2 nappal túllépve`**, keeping the `over` style.
- Its hint gives the full picture: *"Szabadság 2026: 2 nap kivéve, 7 összesen (5 + 2 áthozott).
  Kattints az áthozott napokhoz."* Clicking still opens the carry-over editor.
- **Munkatársak** gets a read-only **Maradt (2026)** column next to *Szabadság/év*, for the
  current calendar year, with the same text. It stays empty when no allowance is set.

**Havi kimutatás (monthly report).**

- In the **Hónap** view the Távollétek bar gets a **Havi kimutatás** button. It opens a panel
  under the bar for the month on screen. It's a report only, so nothing gets locked.
- The panel has a table with one row per person, teachers first, then nannies (`rosterOrder`).
  The columns are:
  - **Szabadság**, **Beteg**, **Egyéb**: days that month
  - **Összesen**
  - **Napok**: the dates, compact: *"6–8., 20."*
  - **Szabadság maradt**: the days left at the **end of that month**, i.e. the calendar-year
    balance counting leave up to the month's last day
- The table lists everyone active, plus anyone inactive or deleted who has an absence that
  month, so the report stays true after someone leaves. A person with no absence shows `0` and
  an empty *Napok* cell.
- The title is *"Távollétek — 2026. október"*. Under the table: *"Készült: 2026.11.02."*
- **Nyomtatás** prints only the report on one A4 portrait page (`print.css`, `print-only`, as
  the roster printout does). **Bezár** closes the panel.

## How it's built

- `src/state/leave.ts`: `leaveBalance` also returns `remaining = total − used`, and takes an
  optional `until` date (default: the year's end) for the month-end figure.
- `src/state/monthReport.ts` (new): `monthReport(absences, staff, month)` returns rows
  `{ staffId, name, role, counts: Record<AbsenceKind, number>, total, dates, leaveLeft? }`.
  It's pure and tested in `tests/state/monthReport.test.ts`. A day counts once, and only working
  days count (the grid can't paint others anyway).
- `src/ui/MonthReport.tsx` (new): the panel and its print block. `AbsenceScreen` holds an open
  flag, which resets when the month changes.
- `src/ui/StaffScreen.tsx`: the *Maradt* column. `src/i18n/hu.ts`: the new strings, plus a
  `compactDates` helper that turns runs of consecutive working days into `6–8.`.

## Decisions

- **Report only, no lock** (her choice over "report + lock").
- **Print now, Excel later.** "Print to PDF" covers emailing it to the accountant. An Excel
  export may be wanted later, so `monthReport` returns plain rows that the print panel and a
  future `xlsx.ts` sheet can share, the way `views.ts` serves both today.
- **Leave left uses the month's end**, so a printed October report stays correct after leave is
  entered for November.
- **The calendar year for leave, as now.** The kindergarten year still only drives fairness.
