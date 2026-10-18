# v3-a — leave remaining + monthly absence report — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Távollétek and Munkatársak show leave *days left* (`5 maradt`). The Távollétek month
view gets a printable *Havi kimutatás*: days away per person by kind, the dates, and the leave
left at month end.

**Architecture:** Pure logic lives in `src/state/` (`leave.ts` grows `remaining` and `until`,
and the new `monthReport.ts` builds plain rows a future Excel sheet can reuse). Formatting lives
in `src/i18n/hu.ts`. The UI is a new `src/ui/MonthReport.tsx`: a screen panel that replaces the
grid while it's open, plus a `print-only` copy on its own A4 portrait page.

**Tech Stack:** React 19 + TypeScript, Vitest + Testing Library (jsdom), plain CSS.

Spec: `docs/specs/2026-10-17-v3-a-leave-remaining-month-report-design.md`. Tests go in `tests/`,
mirroring `src/`. Run everything from the repo root, `Projects/kindergarten-roster`.

## Files

| File | Change |
| --- | --- |
| `src/state/leave.ts` | `remaining`, optional `until` |
| `src/i18n/hu.ts` | `compactDates`; new and changed strings |
| `src/core/names.ts` | gets `rosterOrder` (moved from `AbsenceScreen`) |
| `src/state/monthReport.ts` | new: `monthReport()` rows |
| `src/ui/AbsenceGrid.tsx` | balance button reads days left |
| `src/ui/StaffScreen.tsx` | read-only *Maradt (year)* column |
| `src/ui/MonthReport.tsx` | new: panel + print block |
| `src/ui/AbsenceScreen.tsx` | report toggle, `rosterOrder` import |
| `src/app/app.css`, `src/app/print.css` | report styles, portrait page |
| `README.md` | feature bullets |
| tests | `tests/state/leave.test.ts`, `tests/i18n/hu.test.ts`, `tests/state/monthReport.test.ts`, `tests/ui/AbsenceScreen.test.tsx`, `tests/ui/StaffScreen.test.tsx` |

---

### Task 1: `leaveBalance` returns days left and takes `until`

**Files:**
- Modify: `src/state/leave.ts`
- Test: `tests/state/leave.test.ts`

- [ ] **Step 1: Write the failing tests.** In `tests/state/leave.test.ts`, replace the `describe`
  block with:

```ts
describe('leaveBalance', () => {
  it("counts the calendar year's leave days against allowance plus carry-over", () => {
    expect(leaveBalance(absences, anna, '2026')).toEqual({ used: 2, total: 53, remaining: 51 })
    expect(leaveBalance(absences, anna, '2025')).toEqual({ used: 1, total: 50, remaining: 49 })
  })

  it('counts only the days up to `until`, so a month-end figure ignores later leave', () => {
    expect(leaveBalance(absences, anna, '2026', '2026-10-26')).toEqual({
      used: 1,
      total: 53,
      remaining: 52,
    })
    expect(leaveBalance(absences, anna, '2026', '2026-09-30').remaining).toBe(53)
  })

  it('goes below zero past the allowance', () => {
    const tight: Staff = { ...anna, leaveAllowance: 1, leaveCarry: undefined }
    expect(leaveBalance(absences, tight, '2026').remaining).toBe(-1)
  })
})
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run tests/state/leave.test.ts`
Expected: FAIL. `remaining` is missing from the result.

- [ ] **Step 3: Implement.** Replace the function in `src/state/leave.ts`:

```ts
/**
 * Leave days taken in a calendar year (Hungarian leave is counted per calendar year) against the
 * yearly allowance plus the days she typed in as carried over into that year. With `until`, only
 * the days up to and including it count: the balance as it stood that day.
 */
export function leaveBalance(
  absences: Absence[],
  person: Staff,
  year: string,
  until?: string,
): { used: number; total: number; remaining: number } {
  const used = absences.filter(
    (a) =>
      a.staffId === person.id &&
      a.kind === 'leave' &&
      a.date.startsWith(`${year}-`) &&
      (until === undefined || a.date <= until),
  ).length
  const total = (person.leaveAllowance ?? 0) + (person.leaveCarry?.[year] ?? 0)
  return { used, total, remaining: total - used }
}
```

- [ ] **Step 4: Run them and watch them pass**

Run: `npx vitest run tests/state/leave.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/state/leave.ts tests/state/leave.test.ts
git commit -m "feat(leave): days remaining, and the balance as of a date"
```

---

### Task 2: Hungarian strings and `compactDates`

**Files:**
- Modify: `src/i18n/hu.ts`
- Test: `tests/i18n/hu.test.ts`

- [ ] **Step 1: Write the failing tests.** In `tests/i18n/hu.test.ts`, add `compactDates` and
  `ui` to the import from `'../../src/i18n/hu'`, then append:

```ts
describe('compactDates', () => {
  it('joins consecutive days into ranges', () => {
    expect(compactDates(['2026-10-06', '2026-10-07', '2026-10-08', '2026-10-20'])).toBe(
      '6–8., 20.',
    )
  })
  it('never runs a range across a weekend', () => {
    const twoWeeks = [5, 6, 7, 8, 9, 12, 13, 14, 15, 16].map(
      (d) => `2026-10-${String(d).padStart(2, '0')}`,
    )
    expect(compactDates(twoWeeks)).toBe('5–9., 12–16.')
  })
  it('is empty for no dates', () => {
    expect(compactDates([])).toBe('')
  })
})

describe('leave texts', () => {
  it('says the days left, or how far over', () => {
    expect(ui.absences.balance(5)).toBe('5 maradt')
    expect(ui.absences.balance(0)).toBe('0 maradt')
    expect(ui.absences.balance(-2)).toBe('2 nappal túllépve')
  })
  it('spells out taken and total, with the carry-over only when there is one', () => {
    expect(ui.absences.balanceHint('2026', 2, 5, 2)).toBe(
      'Szabadság 2026: 2 nap kivéve, 7 összesen (5 + 2 áthozott). Kattints az áthozott napokhoz.',
    )
    expect(ui.absences.balanceHint('2026', 2, 5, 0)).toBe(
      'Szabadság 2026: 2 nap kivéve, 5 összesen. Kattints az áthozott napokhoz.',
    )
  })
})
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run tests/i18n/hu.test.ts`
Expected: FAIL. `compactDates` is not exported.

- [ ] **Step 3: Implement.** In `src/i18n/hu.ts`, after `monthLabel`, add:

```ts
/** A month's sorted dates as day numbers, consecutive days joined: '6–8., 20.' */
export function compactDates(dates: string[]): string {
  const runs: [number, number][] = []
  for (const day of dates.map((date) => Number(date.slice(8)))) {
    const last = runs.at(-1)
    if (last && day === last[1] + 1) last[1] = day
    else runs.push([day, day])
  }
  return runs.map(([from, to]) => (from === to ? `${from}.` : `${from}–${to}.`)).join(', ')
}
```

In `ui.absences`, replace `balance` and `balanceHint` and add `report`:

```ts
    balance: (remaining: number) =>
      remaining >= 0 ? `${remaining} maradt` : `${-remaining} nappal túllépve`,
    balanceHint: (year: string, used: number, allowance: number, carry: number) =>
      `Szabadság ${year}: ${used} nap kivéve, ${allowance + carry} összesen` +
      (carry > 0 ? ` (${allowance} + ${carry} áthozott)` : '') +
      '. Kattints az áthozott napokhoz.',
    report: {
      open: 'Havi kimutatás',
      title: (month: string) => `Távollétek — ${monthLabel(month)}`,
      columns: ['Név', 'Szabadság', 'Beteg', 'Egyéb', 'Összesen', 'Napok', 'Szabadság maradt'],
      made: (date: string) => `Készült: ${date.replaceAll('-', '.')}.`,
      print: 'Nyomtatás',
      close: 'Bezár',
    },
```

In `ui.staff`, add `leaveLeft` after `leaveAllowanceHint`, and change the hint's second sentence:

```ts
    leaveAllowanceHint:
      'Éves szabadságkeret napokban. Üresen hagyva nem követjük. A Távollétek és a Munkatársak ' +
      'fülön látszik, mennyi maradt belőle.',
    leaveLeft: (year: string) => `Maradt (${year})`,
```

In `ui.staff.legend`, change the last line to:

```ts
      'Szabadság/év: ha megadod, a Távollétek és a Munkatársak fülön látszik, mennyi maradt a keretből.',
```

- [ ] **Step 4: Run them and watch them pass.** Expect a type error in `AbsenceGrid.tsx` until
  Task 5. Vitest doesn't typecheck, so the tests still run.

Run: `npx vitest run tests/i18n/hu.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/i18n/hu.ts tests/i18n/hu.test.ts
git commit -m "feat(i18n): leave-left texts, report strings, compact date ranges"
```

---

### Task 3: Move `rosterOrder` to `src/core/names.ts`

**Files:**
- Modify: `src/core/names.ts`, `src/ui/AbsenceScreen.tsx:21-30`

- [ ] **Step 1: Move it.** Append to `src/core/names.ts`:

```ts
/** Teachers first, then nannies, each by name. */
export function rosterOrder(staff: Staff[]): Staff[] {
  return [...staff].sort((a, b) =>
    a.role === b.role
      ? (a.displayName || a.fullName).localeCompare(b.displayName || b.fullName, 'hu')
      : a.role === 'teacher'
        ? -1
        : 1,
  )
}
```

In `src/ui/AbsenceScreen.tsx`, delete the `rosterOrder` function and its doc comment, and add
`import { rosterOrder } from '../core/names'`.

- [ ] **Step 2: Check nothing broke**

Run: `npx vitest run tests/ui/AbsenceScreen.test.tsx`
Expected: PASS (behaviour unchanged).

- [ ] **Step 3: Commit**

```bash
git add src/core/names.ts src/ui/AbsenceScreen.tsx
git commit -m "refactor: rosterOrder lives in core/names, so state/ can sort people too"
```

---

### Task 4: `monthReport()` rows

**Files:**
- Create: `src/state/monthReport.ts`
- Test: `tests/state/monthReport.test.ts`

- [ ] **Step 1: Write the failing test.** Create `tests/state/monthReport.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { Absence, AbsenceKind, Staff } from '../../src/core/types'
import { monthReport } from '../../src/state/monthReport'

const person = (id: string, displayName: string, role: Staff['role'], more: Partial<Staff> = {}) =>
  ({ id, fullName: displayName, displayName, role, active: true, ...more }) satisfies Staff

const staff: Staff[] = [
  person('n', 'Nóra', 'nanny'),
  person('b', 'Bea', 'teacher', { leaveAllowance: 20, leaveCarry: { '2026': 2 } }),
  person('a', 'Anna', 'teacher'),
  person('o', 'Ottó', 'nanny', { active: false }), // left, but away this month
  person('g', 'Gizi', 'teacher', { deleted: true }), // deleted, but away this month
  person('r', 'Rita', 'nanny', { active: false }), // left, nothing this month
]
const away = (staffId: string, date: string, kind: AbsenceKind): Absence => ({
  staffId,
  date,
  kind,
})
const absences: Absence[] = [
  away('b', '2026-09-14', 'leave'), // last month: only in the balance
  away('b', '2026-10-06', 'leave'),
  away('b', '2026-10-07', 'leave'),
  away('b', '2026-10-08', 'leave'),
  away('b', '2026-10-20', 'sick'),
  away('b', '2026-10-21', 'other'),
  away('b', '2026-11-03', 'leave'), // next month: not in October's balance
  away('a', '2026-10-11', 'sick'), // a Sunday: not a working day
  away('o', '2026-10-12', 'sick'),
  away('g', '2026-10-13', 'leave'),
]

describe('monthReport', () => {
  const rows = monthReport(absences, staff, '2026-10')

  it('lists teachers then nannies by name, including anyone gone who was away that month', () => {
    expect(rows.map((r) => r.name)).toEqual(['Anna', 'Bea', 'Gizi', 'Nóra', 'Ottó'])
  })

  it("counts the month's working days by kind, with the dates", () => {
    const bea = rows.find((r) => r.staffId === 'b')!
    expect(bea.counts).toEqual({ leave: 3, sick: 1, other: 1 })
    expect(bea.total).toBe(5)
    expect(bea.dates).toEqual([
      '2026-10-06',
      '2026-10-07',
      '2026-10-08',
      '2026-10-20',
      '2026-10-21',
    ])
  })

  it('gives the leave left at the end of the month, ignoring later leave', () => {
    expect(rows.find((r) => r.staffId === 'b')!.leaveLeft).toBe(22 - 4)
  })

  it('shows zeros and no balance for someone with nothing that month and no allowance', () => {
    const anna = rows.find((r) => r.staffId === 'a')!
    expect(anna).toMatchObject({ counts: { leave: 0, sick: 0, other: 0 }, total: 0, dates: [] })
    expect(anna.leaveLeft).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/state/monthReport.test.ts`
Expected: FAIL. The module `src/state/monthReport` can't be found.

- [ ] **Step 3: Implement.** Create `src/state/monthReport.ts`:

```ts
import { isWorkingDay } from '../core/calendar'
import { rosterOrder } from '../core/names'
import type { Absence, AbsenceKind, Role, Staff } from '../core/types'
import { leaveBalance } from './leave'

/** One person's month, as plain data: the print panel shows it, and an Excel sheet could. */
export type MonthReportRow = {
  staffId: string
  name: string
  role: Role
  counts: Record<AbsenceKind, number>
  total: number
  dates: string[] // the month's absent working days, sorted
  leaveLeft?: number // at the month's end; undefined when no allowance is set
}

/**
 * Who was away how many days in `month` ('2026-10'), for the accountant. Everyone active, plus
 * anyone inactive or deleted who was away that month, so the report stays true after they leave.
 */
export function monthReport(absences: Absence[], staff: Staff[], month: string): MonthReportRow[] {
  const inMonth = absences.filter((a) => a.date.startsWith(`${month}-`) && isWorkingDay(a.date))
  const away = new Set(inMonth.map((a) => a.staffId))
  const people = rosterOrder(staff.filter((s) => (s.active && !s.deleted) || away.has(s.id)))
  const year = month.slice(0, 4)
  return people.map((s) => {
    const byDate = new Map(inMonth.filter((a) => a.staffId === s.id).map((a) => [a.date, a.kind]))
    const counts: Record<AbsenceKind, number> = { leave: 0, sick: 0, other: 0 }
    for (const kind of byDate.values()) counts[kind]++
    return {
      staffId: s.id,
      name: s.displayName || s.fullName,
      role: s.role,
      counts,
      total: byDate.size,
      dates: [...byDate.keys()].sort(),
      // Every date of the month sorts at or before '-31'.
      leaveLeft:
        s.leaveAllowance === undefined
          ? undefined
          : leaveBalance(absences, s, year, `${month}-31`).remaining,
    }
  })
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run tests/state/monthReport.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/state/monthReport.ts tests/state/monthReport.test.ts
git commit -m "feat(absences): monthReport — days away per person and kind, leave left at month end"
```

---

### Task 5: The Távollétek balance reads days left

**Files:**
- Modify: `src/ui/AbsenceGrid.tsx` (the `balance &&` button)
- Test: `tests/ui/AbsenceScreen.test.tsx` (the "leave balance" test)

- [ ] **Step 1: Update the test.** In the test *"shows the shown year's leave balance and edits
  that year's carry-over"*, replace `fireEvent.click(screen.getByText('2 / 53'))` with:

```ts
    const balance = screen.getByText('51 maradt')
    expect(balance.title).toBe(
      'Szabadság 2026: 2 nap kivéve, 53 összesen (50 + 3 áthozott). Kattints az áthozott napokhoz.',
    )
    fireEvent.click(balance)
```

  Then add a test after it:

```ts
  it('says how far over the allowance someone is', () => {
    const steps: Action[] = [
      { type: 'updateStaff', id: 'a', patch: { leaveAllowance: 1 } },
      on('leave', '2026-10-26'),
      on('leave', '2026-10-27'),
    ]
    render(<Screen state={steps.reduce(reducer, state)} dispatch={vi.fn()} />)
    expect(screen.getByText('1 nappal túllépve').className).toBe('leave-balance over')
  })
```

  (`on` is defined above these tests in the same `describe`.)

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/ui/AbsenceScreen.test.tsx`
Expected: FAIL. It can't find the text "51 maradt".

- [ ] **Step 3: Implement.** In `src/ui/AbsenceGrid.tsx`, replace the balance button with:

```tsx
                    {balance && (
                      <button
                        className={balance.remaining < 0 ? 'leave-balance over' : 'leave-balance'}
                        title={ui.absences.balanceHint(
                          year,
                          balance.used,
                          s.leaveAllowance ?? 0,
                          s.leaveCarry?.[year] ?? 0,
                        )}
                        onClick={() => setCarryOpen(carryOpen === s.id ? undefined : s.id)}
                      >
                        {ui.absences.balance(balance.remaining)}
                      </button>
                    )}
```

- [ ] **Step 4: Run it and watch it pass, then typecheck**

Run: `npx vitest run tests/ui/AbsenceScreen.test.tsx && npm run typecheck`
Expected: PASS, and no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/ui/AbsenceGrid.tsx tests/ui/AbsenceScreen.test.tsx
git commit -m "feat(absences): the leave balance shows days left, or how far over"
```

---

### Task 6: Munkatársak shows days left

**Files:**
- Modify: `src/ui/StaffScreen.tsx` (`StaffColumn`: header row and the allowance cell)
- Test: `tests/ui/StaffScreen.test.tsx`

- [ ] **Step 1: Write the failing test.** Append inside `describe('StaffScreen', …)`:

```ts
  it("shows this calendar year's leave left next to the allowance, empty without one", () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 5, 12))
    try {
      renderScreen(
        run(
          ...person('a', 'Kiss Anna'),
          { type: 'updateStaff', id: 'a', patch: { leaveAllowance: 40 } },
          { type: 'setAbsent', staffId: 'a', dates: ['2026-10-26', '2026-10-27'], absent: true, kind: 'leave' },
          ...person('n', 'Nagy Nóra', 'Nóra', 'nanny'),
        ),
      )
      expect(column(/Óvónők/).getByText('Maradt (2026)')).toBeTruthy()
      expect(column(/Óvónők/).getByText('38 maradt')).toBeTruthy()
      expect(column(/Dajkák/).queryByText(/maradt$/)).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/ui/StaffScreen.test.tsx`
Expected: FAIL. It can't find the text "Maradt (2026)".

- [ ] **Step 3: Implement.** In `src/ui/StaffScreen.tsx`:
  - Add `import { leaveBalance } from '../state/leave'`.
  - At the top of `StaffColumn`'s body, add `const year = today().slice(0, 4)`.
  - After the allowance `<th>`, add `<th>{ui.staff.leaveLeft(year)}</th>`.
  - After the allowance `<td>` (the one holding the number input), add:

```tsx
                  <td className="leave-left">
                    {s.leaveAllowance !== undefined &&
                      ui.absences.balance(leaveBalance(state.absences, s, year).remaining)}
                  </td>
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run tests/ui/StaffScreen.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/StaffScreen.tsx tests/ui/StaffScreen.test.tsx
git commit -m "feat(staff): leave left this year beside the allowance"
```

---

### Task 7: Havi kimutatás — the panel and its printout

**Files:**
- Create: `src/ui/MonthReport.tsx`
- Modify: `src/ui/AbsenceScreen.tsx`, `src/app/app.css`, `src/app/print.css`
- Test: `tests/ui/AbsenceScreen.test.tsx`

- [ ] **Step 1: Write the failing test.** In `tests/ui/AbsenceScreen.test.tsx`, add `within` to
  the `@testing-library/react` import. Append inside the `describe` that defines `on`:

```ts
  it('shows the monthly report in place of the grid, prints it, and closes on a month change', () => {
    const steps: Action[] = [
      { type: 'updateStaff', id: 'a', patch: { leaveAllowance: 20 } },
      on('leave', '2026-10-06'),
      on('leave', '2026-10-07'),
      on('sick', '2026-10-20'),
    ]
    const print = vi.spyOn(window, 'print').mockImplementation(() => {})
    render(<Screen state={steps.reduce(reducer, state)} dispatch={vi.fn()} />)
    fireEvent.click(screen.getByText('Havi kimutatás'))

    const panel = within(screen.getByRole('region', { name: 'Távollétek — 2026. október' }))
    const cells = (name: string) =>
      [...panel.getByRole('rowheader', { name }).closest('tr')!.querySelectorAll('td')].map(
        (td) => td.textContent,
      )
    expect(cells('Anna')).toEqual(['2', '1', '0', '3', '6–7., 20.', '18'])
    expect(cells('Nóra')).toEqual(['0', '0', '0', '0', '', ''])
    expect(document.querySelector('.absence-grid')).toBeNull()
    expect(document.querySelector('.month-report-print')).toBeTruthy()

    fireEvent.click(panel.getByText('Nyomtatás'))
    expect(print).toHaveBeenCalledOnce()

    fireEvent.click(screen.getByLabelText('Következő hónap'))
    expect(screen.queryByRole('region', { name: /^Távollétek —/ })).toBeNull()
    expect(document.querySelector('.absence-grid')).toBeTruthy()
    print.mockRestore()
  })

  it('closes the report with Bezár', () => {
    render(<Screen state={state} dispatch={vi.fn()} />)
    fireEvent.click(screen.getByText('Havi kimutatás'))
    fireEvent.click(screen.getByText('Bezár'))
    expect(document.querySelector('.absence-grid')).toBeTruthy()
  })
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run tests/ui/AbsenceScreen.test.tsx`
Expected: FAIL. It can't find the text "Havi kimutatás".

- [ ] **Step 3: Create `src/ui/MonthReport.tsx`**

```tsx
import type { Absence, Staff } from '../core/types'
import { compactDates, ui } from '../i18n/hu'
import { monthReport, type MonthReportRow } from '../state/monthReport'
import { today } from './dates'

type Props = { absences: Absence[]; staff: Staff[]; month: string }

function ReportTable({ rows }: { rows: MonthReportRow[] }) {
  return (
    <table className="month-report-table">
      <thead>
        <tr>
          {ui.absences.report.columns.map((column) => (
            <th key={column}>{column}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.staffId}>
            <th scope="row">{row.name}</th>
            <td>{row.counts.leave}</td>
            <td>{row.counts.sick}</td>
            <td>{row.counts.other}</td>
            <td>{row.total}</td>
            <td className="dates">{compactDates(row.dates)}</td>
            <td>{row.leaveLeft ?? ''}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** On screen, in place of the grid. */
export function MonthReportPanel({ onClose, ...props }: Props & { onClose: () => void }) {
  const title = ui.absences.report.title(props.month)
  return (
    <section className="month-report" aria-label={title}>
      <h3>{title}</h3>
      <ReportTable rows={monthReport(props.absences, props.staff, props.month)} />
      <div className="month-report-actions">
        <button className="primary" onClick={() => window.print()}>
          {ui.absences.report.print}
        </button>
        <button onClick={onClose}>{ui.absences.report.close}</button>
      </div>
    </section>
  )
}

/** One A4 portrait page, shown only when printing (see print.css). */
export function MonthReportPrint({ absences, staff, month }: Props) {
  return (
    <div className="print-only month-report-print">
      <h1>{ui.absences.report.title(month)}</h1>
      <ReportTable rows={monthReport(absences, staff, month)} />
      <p className="footnotes">{ui.absences.report.made(today())}</p>
    </div>
  )
}
```

- [ ] **Step 4: Wire it into `src/ui/AbsenceScreen.tsx`**
  - Import: `import { MonthReportPanel, MonthReportPrint } from './MonthReport'`.
  - After the `brush` state, add:

```tsx
  const [report, setReport] = useState(false)
  // A month change closes the report, so it never shows a month she didn't open it for.
  const goMonth = (next: string) => {
    setMonth(next)
    setReport(false)
  }
```

  - Replace the three `setMonth(...)` calls in the month navigation (◀, ▶, and the
    `TodayButton` `onClick`) with `goMonth(...)`. Leave the `setMonth(week.slice(0, 7))` in the
    view switch alone: the report closes there anyway, via `showReport` below.
  - After `const byWeek = …`, add `const showReport = view === 'month' && report`.
  - In the month branch of the bar, right after its `TodayButton`, add:

```tsx
            <button
              className={report ? 'on' : undefined}
              aria-pressed={report}
              onClick={() => setReport(!report)}
            >
              {ui.absences.report.open}
            </button>
```

  - Replace the hint and grid at the end of the section, and wrap the return in a fragment so
    the print copy sits outside the screen-only section:

```tsx
  return (
    <>
      <section className={showReport ? 'absence-screen screen-only' : 'absence-screen'}>
        {/* …the bar, unchanged… */}
        {showReport ? (
          <MonthReportPanel
            absences={state.absences}
            staff={state.staff}
            month={month}
            onClose={() => setReport(false)}
          />
        ) : (
          <>
            <p className="hint">{ui.absences.hint}</p>
            <AbsenceGrid
              state={state}
              dispatch={dispatch}
              people={people}
              days={byWeek ? weekDays : monthDays(month)}
              brush={brush}
              wide={byWeek}
            />
          </>
        )}
      </section>
      {showReport && (
        <MonthReportPrint absences={state.absences} staff={state.staff} month={month} />
      )}
    </>
  )
```

- [ ] **Step 5: Styles.** Append to `src/app/app.css`:

```css
.month-report h3 {
  margin: 0 0 8px;
}
.month-report-table {
  border-collapse: collapse;
  background: var(--surface);
}
.month-report-table th,
.month-report-table td {
  padding: 4px 12px;
  border: 1px solid var(--border);
  text-align: right;
}
.month-report-table th:first-child,
.month-report-table td.dates {
  text-align: left;
}
.month-report-actions {
  display: flex;
  gap: 12px;
  margin-top: 12px;
}
```

  In `src/app/print.css`, inside `@media print`, after the existing `@page { … }` block, add:

```css
  /* The monthly absence report: one portrait page, unlike the landscape roster. */
  @page report {
    size: A4 portrait;
    margin: 12mm;
  }
  .month-report-print {
    page: report;
  }
  .month-report-print h1 {
    margin: 0 0 6pt;
    font-size: 14pt;
  }
```

- [ ] **Step 6: Run the tests and watch them pass, then typecheck**

Run: `npx vitest run tests/ui/AbsenceScreen.test.tsx && npm run typecheck`
Expected: PASS, and no type errors.

- [ ] **Step 7: Commit**

```bash
git add src/ui/MonthReport.tsx src/ui/AbsenceScreen.tsx src/app/app.css src/app/print.css tests/ui/AbsenceScreen.test.tsx
git commit -m "feat(absences): Havi kimutatás — a printable month report in place of the grid"
```

---

### Task 8: README, full verification, browser check

**Files:**
- Modify: `README.md` (the *Munkatársak* and *Távollétek* bullets, lines 14–31)

- [ ] **Step 1: README.** Under **Munkatársak**, change the staff-list bullet's end to *"…and a
  yearly leave allowance with the days left this year."* Under **Távollétek**, replace *"Next to
  each name, the leave taken against the allowance plus days carried over."* with:

```md
- Next to each name, the leave days left this calendar year (allowance plus days carried over,
  minus leave taken), or how far over.
- **Havi kimutatás** (month view): per person, the month's days away by kind, the dates and the
  leave left at month end, in place of the grid. It prints on one A4 portrait page for the
  accountant.
```

- [ ] **Step 2: Run everything**

Run: `npx prettier --write src tests README.md docs && npm test && npm run typecheck && npm run format:check && npm run build`
Expected: every test passes, no type errors, format is clean, and the build succeeds.

- [ ] **Step 3: Check it in the browser.** Run `npm run dev` and load the demo data:
  - The Távollétek balance reads *N maradt*, and the hover text spells out taken and total.
  - Munkatársak shows the *Maradt* column.
  - *Havi kimutatás* replaces the grid, and nothing below it jumps.
  - Ctrl+P shows only the report, on a portrait page, in both themes.
  - ◀ ▶ close the report.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: README covers leave left and the monthly report"
```

- [ ] **Step 5: Open a PR** (CI deploys Pages only from a green `main`), via
  superpowers:finishing-a-development-branch.
