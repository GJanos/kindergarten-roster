# kindergarten-roster — helper roles: pedagógiai asszisztens and civil (v3-c)

Status: **agreed with the user, 2026-10-17**, from her feedback round. Last of three v3 parts
(a → b → c). It builds on v3-b's ügyelet, nanny-seat shifts and stage order.

## Problem

Her staff includes two kinds of helpers the app can't hold. Both usually work a **day shift,
8:00–16:00**. Sometimes they work 6–14 or 10–18, and today she plans that around the app.

## Her rules

**Pedagógiai asszisztens (teacher's helper).**

- **An extra, not a requirement.** No group needs one. On 8–16 they sit in a group **beside its
  DE teacher**, so that group's DE seat has a real teacher.
- **They stand in only when a teacher is missing.** They can take a **DU teacher seat** alone, on
  10–18 (which covers the 10:30–17:00 seat), but **never a DE seat**.
- As a DU stand-in in the ügyelet group they **do the DU ügyelet**. Their 10–18 already covers
  17:30, so their times don't move. It doesn't count in the teachers' ügyelet fairness.
- **They never open or close.**

**Civil.**

- **A floating helper on 8–16, with no group seat.** They help the DE and DU nannies at once.
- **When a group has no nanny**, a civil takes the nanny seat on 6–14 or 10–18, **before** a
  teacher would. Teacher → nanny stays the last resort.
- As a stand-in nanny they **can open or close**. That's a rare edge case, allowed.

**Both.**

- **8–16 is the default.** The solver moves a helper to 6–14 / 10–18 **only to fill a seat**, and
  a warning says why: *"Bea 10–18: 2. csoport DU óvónő hiányzik."*
- **She can change a helper's shift by hand** on the roster (8–16 / 6–14 / 10–18) for any reason.
  It works like a swap: `edited`, undo, changed-cell marks, and a re-solve drops it.
- Helpers have a **leave allowance** and absences like everyone else (v3-a applies).
- **Fairness doesn't apply to them.** They're outside every fairness count and the yearly
  balance, and outside v3-b's daily DE/DU balance. A civil in a nanny seat does count in the
  nanny pair rule, since that rule is about the seat.

## Model

- **Types:** `Role` adds `'assistant' | 'civil'`, and `Shift` adds `'day'`. For helpers:
  `day` 8:00–16:00, `morning` 6:00–14:00, `afternoon` 10:00–18:00, the same on Fridays.
- **Seat:** adds `{ kind: 'helper'; group }` for an asszisztens on 8–16. A stand-in uses the
  existing teacher / nanny seat with `substitution`. A civil on 8–16 has no seat. The views show
  them as *"Civil"*, not *"csoporton kívül"*.
- **Helper shifts:** each present helper is on exactly one of `day / morning / afternoon`.
  `day` is forced unless the helper is in a stand-in seat. An asszisztens DU stand-in needs
  `afternoon`. A civil nanny stand-in needs `morning` or `afternoon`, so v3-b's nanny-seat shift
  applies to them.
- **Asszisztens:** on `day`, a helper seat in at most one group, **≤ 1 asszisztens per group**.
  That group's DE seat isn't a hole. Placement is soft, beyond the switches stage keeping them in
  one group all week. With more asszisztens than open groups, the extras are in no group.
  Stand-in seats are allowed only when the day's teachers are fewer than `2 × groups`. The
  group's DE seat must still be a teacher (group minimum).
- **Civil:** nanny-seat stand-ins are allowed only when the day's nannies are fewer than the
  groups, the same gate as teacher substitutes today.
- **Substitutions stage, by weight:** asszisztens → DU seat **1**, civil → nanny seat **1**,
  teacher → nanny seat **3**. That way a civil is always used before a teacher.
- **Ügyelet:** a group can be on duty when its DE seat is a teacher and its DU seat is a teacher
  **or** an asszisztens stand-in.
- **Capacity (`capacity.ts`):** `gMax` counts civils with the nannies (`teachers + nannies +
  civils`). Asszisztens don't raise `gMax`, since a group still needs its DE teacher, but they
  lower teacher holes. `zeroHoleNeeds` and Távollétek's *Távol* coverage rows follow the same
  counting.

## App

- **Munkatársak:** four sections: *Óvónők, Dajkák, Pedagógiai asszisztensek, Civilek*, each with
  its own add row.
- **Távollétek:** the same four sections, with a *Távol* row each. Only teachers and nannies get
  the red *short* mark.
- **Roster cell for a helper:** a click offers **8–16 / 6–14 / 10–18** next to the swap actions.
  Validate refuses a shift that breaks a stand-in seat, e.g. an asszisztens DU seat on 6–14.
- **Group view:**
  - an asszisztens line *"Asszisztens: Bea (8–16)"*
  - a stand-in *"DU: Bea (asszisztens, 10–18)"*, in the substitution tone
  - civils in the reserve block as *"Civil: Zsófi (8–16)"*
- **Person view:** two more sections, and a `day` fill colour.
- **Excel / print:** the same, from `views.ts`.
- **Warnings:** `SUBSTITUTION` gets helper texts that name the shift (the "why" she asked for).
- **Data:** `migrate.ts` accepts the new roles. Old backups load unchanged, so there's no schema
  bump. Undo, backup and restore carry `shift: 'day'`.

## Tests

- An asszisztens stays on 8–16 in a group with a DE teacher, and goes to 10–18 only for a missing
  DU teacher.
- A civil goes before a teacher for a nanny seat.
- Helpers never show up in fairness shares, the balance or the year totals.
- A by-hand shift change sets `edited`, can be undone, and validate refuses a broken stand-in.
- Capacity with civils.
- Old backups migrate.

## Decisions (assumptions, to confirm with her)

- The shift is named **"Napi"** (short **NAP**), after her *"napi műszak"*.
- At most **one asszisztens per group**. Helper times are the same on Fridays.
- Helper placement is otherwise **free** (any group with a DE teacher). There are no personal
  requests, as in spec §2.
