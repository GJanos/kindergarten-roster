# kindergarten-roster — ügyelet, nanny pairs, DE/DU balance, keys demoted (v3-b)

Status: **agreed with the user, 2026-10-17**, from her feedback round. Second of three v3 parts
(a → b → c). It supersedes spec §2's "no ügyelet" and changes the stage order of §6.5. It works
on today's two roles; the helper roles come in v3-c.

## Problem

Her real weeks show four things the model doesn't know:

1. **Ügyelet** (duty): every day one group's two teachers cover the early morning and the late
   afternoon. Today nothing plans it.
2. Groups **1–2, 3–4…** come out with both nannies on DE, which leaves the pair without an
   afternoon nanny. One should be DE and the other DU.
3. Some days come out lopsided, e.g. 5 DE and 1 DU (reserves included), and later in the week
   the reverse.
4. Opening and closing cost nobody anything, since the hours are the same either way. Their even
   split shouldn't push out things she cares about more. The opener and the closer should be
   nannies **in a group**, not reserve ones.

## Her rules

**Ügyelet.**

- Every open day has **exactly one ügyelet group**. Both its teachers are on duty: the DE
  teacher comes 30 min early, and the DU teacher leaves 30 min late. **Same length, shifted:**

  | Teacher | Normal | Ügyelet |
  | --- | --- | --- |
  | DE Mon–Thu | 7:00–13:30 | 6:30–13:00 |
  | DU Mon–Thu | 10:30–17:00 | 11:00–17:30 |
  | DE Fri / working Sat | 7:00–13:00 | 6:30–12:30 |
  | DU Fri / working Sat | 11:00–17:00 | 11:30–17:30 |

- The solver picks the group each day. Only a group with **both teacher seats filled** can be on
  duty. (v3-c adds an asszisztens covering DU.)
- **Ügyelet days are a fairness count**: even within the week first, across the kindergarten
  year second, like morning shifts.

**Nanny pairs (soft, strong).** On a day where groups *2k−1* and *2k* are both open, one nanny
seat of the pair is DE and the other DU. With an odd count the last group has no pair. It breaks
only when nothing else works.

**Daily DE/DU balance (soft, weaker).** Each day, for teachers and nannies **separately**, count
everyone present on DE and on DU, **reserves included**. A gap of 0–1 is fine, 2 gets a small
penalty, 3 or more a big one. Seated teachers are always 1 DE + 1 DU per group, so for teachers
only the reserves can tip it.

**Keys, demoted.** The opener and the closer should be **seated** nannies, not reserve ones. That
rule and the opener/closer even split move to a minor stage. The strict rule "nobody opens, or
closes, on every working day" stays.

## Stage order (her approval, 2026-10-17)

```
holes → substitutions → keepPeople → keepHours → keepDuties → pairs → worstGap → totalGap
→ balance → switches → turnarounds → keysSeated → keysGap → yearly
```

- `holes` also counts a **missing ügyelet** day.
- `worstGap` / `totalGap` cover **morning, reserve, duty**. Opener and closer leave them.
- `keysSeated` counts openers and closers who are reserve. `keysGap` sums the opener/closer gaps.
- `worstGapFloor` is computed over the kinds `worstGap` still covers.

## Model (`src/core/model.ts`)

- **Ügyelet:** `y_d_g` is a binary per day and group, with `Σ_g y_d_g + hd_d = 1` (`hd_d` is the
  duty hole, counted in `holes`). Also `y_d_g ≤ 1 − ht_d_g_t` for both shifts. A teacher's duty is
  `z_p_d_g_t`, linking `x_p_d_g_t` and `y_d_g` (`z ≤ x`, `z ≤ y`, `z ≥ x + y − 1`). Their duty
  count sums `z`.
- **Duty share** (`fairness.ts`, new `GapKind` `'duty'`): on days with **2 or more groups**, the
  pool is `2 × days`, dealt over present teachers by days present (as the keys are). On a
  1-group day duty is forced, so that day stays out of the share.
- **Nanny seats get a shift:** `n_p_d_g` becomes `n_p_d_g_t`, `≤ s_p_d_t`, as teacher seats
  already have. Substitutes' `u_p_d_g` get one too. Then `de_d_g = Σ_p n_p_d_g_m (+ u)`.
- **Pairs:** `pv_d_k ≥ de_g + de_g' − 1` and `pv_d_k ≥ du_g + du_g' − 1`. `pairs` minimises
  `Σ pv`.
- **Balance:** per day and role, `diff = Σ_present s_m − Σ_present s_a`. `e1 ≥ ±diff − 1`,
  `e2 ≥ ±diff − 2`, all `≥ 0`. `balance` minimises `Σ (e1 + 2·e2)`, so a gap of 2 costs 1, 3
  costs 4, and 4 costs 7.
- **Keys seated:** `ks_p_d ≥ o_p_d − seats_d_p` (likewise for close). `keysSeated` minimises
  `Σ ks`.

## Around the solver

- **Types:** `Assignment.duty?: true` on both duty teachers. `GapKind` adds `'duty'`, and the
  yearly `Balance` picks it up. Saved rosters without it read as 0, so there's no schema bump.
- **Times:** `shiftTimes(role, shift, date, duty?)` returns the table above.
- **Swaps (`edit.ts`):** duty belongs to the seat. Whoever takes a duty seat takes the duty.
- **Validate:** exactly one duty group per open day (unless a duty hole is reported). Duty only
  on its two teacher seats, never on a hole.
- **Recalc:** past days pin `y`. A changed duty changes times, so it counts in `keepHours`. The
  phone list says *"ügyelet"* / *"nem ügyeletes"*.
- **Warnings (`explain.ts`):**
  - `DUTY_MISSING` (red): *"Nincs ügyeletes csoport: egy csoportban sincs meg mindkét óvónő."*
  - `PAIR_SAME` (grey): *"1–2. csoport: mindkét dajka DE."*
  - `SHIFT_IMBALANCE`: grey at a gap of 2, orange at 3 or more: *"Kedd: dajkák 4 DE / 1 DU."*
- **Views, print, Excel (`views.ts`):** the duty group's cell starts with a bold **Ügyelet**
  line, and its teacher lines show the shifted start (*"DE: Kati 6:30"*). The person view shows
  *"DE 6:30–13:00 · ügyelet"*. Openers and closers stay bold, as now.
- **Year balance:** a new **Ügyelet** column.

## Tests

`tests/core/` mirrors `src/core`:

- A duty group every day, and only on days with both seats filled.
- Duty fair within a week. The pair rule holds when it can and breaks only when it must. Balance
  gaps ≤ 1 on the demo weeks.
- Keys come from seated nannies whenever one is on the right shift.
- Validate rejects two duty groups and duty on a hole. A swap moves duty with the seat.
- Recalc pins past duty.

**Performance gate:** her real weeks (`data/ovoda-mentes-*.json`) and the 6–8-group demo, timed
per stage. Four more stages at 15 s each can push the worst case, so the watchdog limit is
checked against the new total.

## Decisions

- **Shifted, not stretched.** Her "time limits are always kept" (§2) holds, since the length
  stays 6.5 h / 6 h.
- **Asszisztens ügyelet** (v3-c) doesn't count in the teachers' ügyelet fairness.
- **No pairing across days.** The pair rule is per day. Group persistence (switches) already
  keeps the same nanny in a group.
