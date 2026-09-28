# kindergarten-roster — sick-call recalculation (v2-F)

Status: **agreed with the user, 2026-09-28; implemented** (plan v2-F). The last open item of spec §13. Plan:
`docs/plans/2026-09-28-v2-f-sick-call.md`.

## Problem

A sick call during a break week means marking the absence and pressing Számol, which re-solves
the whole week from scratch. Past days get rewritten, and people whose days had nothing to do
with the sick person get new shifts. She wants the opposite: the days already worked stay as
they were, the gap gets filled with as few changes as possible, and she sees who to phone.

## What she sees

**Two ways in, one recalculation.**

1. **From the roster: "Beteg lett…"** (got sick). She clicks a name, as for a swap. Next to
   *Mégse* the bar offers **Beteg lett…**, but only for a day that is today or later. That opens
   *"Kati beteg keddtől — meddig?"* (Kati is sick from Tuesday — until when?) with a date field.
   It starts on the picked day, and she sets the last sick day. **Beteg — újraszámol** (sick —
   recalculate) marks every working day in that range as *beteg*, then recalculates with the
   fewest changes. The range may run past this week; the later weeks' rosters simply turn
   outdated.
2. **From Távollétek, as usual.** She marks the absence and comes back to Beosztás. Once a week
   has started (its first working day has come, Monday included), **Számol** and **Újraszámol**
   don't solve right away. First they show:
   *"A hét már elkezdődött — a korábbi napok változatlanok maradnak."* (The week has started;
   earlier days stay as they are.) The choices are:
   - **Csak a szükséges változtatások** (only the needed changes): the default.
   - **Mától mindent újraszámol** (re-plan everything from today).
   - **Mégse** (cancel).

   No warning appears on Távollétek itself: the decision comes where the solve happens.

**Quick fixes** (*Szerdán 1 csoport*, *Emese mégis jön*) in a week in progress always use the
fewest-changes mode, without asking. Days already over get no fix buttons.

**The result.** The undo bar names the change (*"Kati beteg: 10.27.–10.29."*) and counts the
changed cells as before. Below that it lists the people to phone:
*"1 munkatárs beosztása változott:"* (1 person's schedule changed), then one line per changed day,
today first:
*"Bea: ma DE 6:00–14:00, 2. cs., nyit (eddig DU 10:00–18:00, csoporton kívül)"*.
Undo puts back the absences and the old roster together.

## How it solves

**Today is not fixed.** A call at 6:30 has to be fixed that day. `from` is the first working day
of the week that is today or later. Days before `from` are history.

**Days before `from` are fixed** in both modes. The model pins every variable of those days to
the anchor roster: shift, seat, opener and closer. Who worked a past day comes from the anchor,
not from the absences: `recalcInput` rebuilds those days' absences, and their group count if it
changed. So an absence typed in afterwards for a past day can't make that day unsolvable or
rewrite it. The past stays as planned.

**Fewest changes ('minimal').** Three new stages go right after holes and substitutions, before
fairness:

1. **keepPeople:** the number of people whose hours change on any day from `from` on.
2. **keepHours:** those person-days. An earlier day costs more (weight = days left), because
   today's changes are the hardest phone calls.
3. **keepDuties:** seat or key moves at unchanged hours. For example, a reserve teacher on the
   same shift sits into the empty seat, or the other morning nanny takes the key.

Someone the anchor had off (a call-in) is placed freely. The sick person's days simply vanish.
Fairness, switches, turnarounds and the yearly tie-break then choose among the rosters that
change the fewest people.

**'full'** keeps the past days fixed and has no stability stages: the rest of the week is
re-planned by fairness as usual.

**Measured on the demo data** (prototype, 2026-09-28), with a sick nanny or teacher on
Wednesday–Thursday:
- **'minimal':** 1–2 people change, with each stage taking about 10 ms.
- **'full':** almost everyone moves. One full run spent 14 s proving its fairness optimum,
  so 'full' can hit the per-stage limit on a slow laptop. The existing *stoppedEarly* note covers
  that.

## Decisions

- **Stability beats fairness inside a recalculation.** Every change is a phone call and someone's
  disrupted day. A fairness gap of one shift is evened out over the year by the yearly balance
  (v2-C), which counts what was actually worked. Holes still come first.
- **People first, then days, then duties.** The message counts people, and hours matter to them.
  A group or key change at the same hours is something she tells them at the door.
- **An opener or closer change is a duty change, not an hours change.** A nanny's morning is
  6:00–14:00 whether or not she opens.
- **Past days are never re-solved,** not even to record a late-typed absence. The roster keeps
  what was planned. (Rewriting the past would move people on days that are over.)
- **The anchor must fit.** If a past day was worked by someone who is no longer active, or the
  saved roster is from another period, there is no anchor. Számol then solves the whole week as
  before, and Beteg lett marks the absence and solves in full. This is rare: deactivating someone
  mid-break.
- **Hand edits:** 'minimal' never asks, since hand edits on the kept days survive and later ones
  mostly do. 'full' asks as Számol does today. A roster recalculated from an edited one stays
  marked *kézzel módosítva*.
- **The watchdog** goes from 150 s to 180 s: a recalculation has up to 10 stages of up to 15 s
  each.

## Out of scope

- A side-by-side before/after view (spec §13's wording). The changed-cell outlines plus the
  per-person lines cover it.
- Reordering stages for ordinary solves: a normal Számol before the week starts behaves exactly
  as today.
