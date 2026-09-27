// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useReducer } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TEST_META, makeStaff } from '../core/fixtures'
import type { Roster, Warning } from '../../src/core/types'
import { emptyState, reducer, type Action, type AppState } from '../../src/state/appState'
import { inputKey, solveInputFor } from '../../src/state/solveInput'
import { SolveFailure, solveInWorker } from '../../src/worker/client'
import { PrintView } from '../../src/ui/PrintView'
import { RosterScreen } from '../../src/ui/RosterScreen'
import { nameRef } from '../../src/core/names'
import { useUndo, type UndoHistory } from '../../src/state/undo'

// The real client would start a Web Worker; keep SolveFailure, fake the solve.
vi.mock(import('../../src/worker/client'), async (importOriginal) => ({
  ...(await importOriginal()),
  solveInWorker: vi.fn(),
}))

beforeEach(() => {
  vi.mocked(solveInWorker).mockReset()
  // Before the test week, so it is the upcoming break and not yet archived.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 5, 12))
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const WEEK = '2026-10-26'
const WED = '2026-10-28'
const DAYS = ['2026-10-26', '2026-10-27', WED, '2026-10-29', '2026-10-30']
const base: AppState = { ...emptyState(), staff: makeStaff(4, 3) }

const hole: Warning = {
  code: 'TEACHER_SEAT_EMPTY',
  severity: 'red',
  date: WED,
  text: 'Szerda, 2. cs.: nincs délutános óvónő (10:30–17:00).',
  action: 'Hívj be valakit, vagy vond össze a csoportot.',
  fix: { kind: 'setGroups', date: WED, groups: 1 },
  cells: [{ date: WED, group: 2 }],
}

// Only Wednesday is filled in; the other days show as closed.
const roster: Roster = {
  period: { start: WEEK, days: DAYS },
  groupsPerDay: Object.fromEntries(DAYS.map((date) => [date, 2])),
  assignments: [
    {
      staffId: 't2',
      date: WED,
      shift: 'morning',
      seat: { kind: 'teacher', group: 1, shift: 'morning' },
    },
    {
      staffId: 't3',
      date: WED,
      shift: 'afternoon',
      seat: { kind: 'teacher', group: 1, shift: 'afternoon' },
    },
    {
      staffId: 't1',
      date: WED,
      shift: 'morning',
      seat: { kind: 'teacher', group: 2, shift: 'morning' },
    },
    { staffId: 't4', date: WED, shift: 'morning' },
    { staffId: 'n1', date: WED, shift: 'morning', seat: { kind: 'nanny', group: 1 }, opener: true },
    {
      staffId: 'n2',
      date: WED,
      shift: 'afternoon',
      seat: { kind: 'nanny', group: 2 },
      closer: true,
    },
    { staffId: 'n3', date: WED, shift: 'afternoon' },
  ],
  holes: [{ kind: 'teacherSeat', date: WED, group: 2, shift: 'afternoon' }],
  warnings: [hole],
  ...TEST_META,
}

function withRoster(state: AppState, key = inputKey(solveInputFor(state, WEEK))): AppState {
  return reducer(state, { type: 'saveRoster', week: WEEK, roster, inputKey: key })
}

const noHistory: UndoHistory = {
  entries: [],
  record: vi.fn(),
  undo: vi.fn(),
  accept: vi.fn(),
  reset: vi.fn(),
  latest: () => undefined,
}

function renderScreen(state: AppState) {
  const dispatch = vi.fn<(action: Action) => void>()
  render(
    <RosterScreen
      state={state}
      dispatch={dispatch}
      week={WEEK}
      onWeek={() => {}}
      history={noHistory}
    />,
  )
  return dispatch
}

const screenTable = () => within(document.querySelector<HTMLElement>('.roster-table')!)

describe('RosterScreen', () => {
  it('opens on the week with a Számol button', () => {
    renderScreen(base)
    expect(screen.getByText('2026. október 26 – 30.')).toBeTruthy()
    expect(screen.getByText(/még nincs beosztás/)).toBeTruthy()
    expect(screen.getByText('Számol')).toBeTruthy()
  })

  it('solves in the worker and saves the roster with its input key', async () => {
    vi.mocked(solveInWorker).mockResolvedValue(roster)
    const dispatch = renderScreen(base)
    fireEvent.click(screen.getByText('Számol'))
    const input = solveInputFor(base, WEEK)
    await waitFor(() =>
      expect(dispatch).toHaveBeenCalledWith({
        type: 'saveRoster',
        week: WEEK,
        roster,
        inputKey: inputKey(input),
      }),
    )
    expect(solveInWorker).toHaveBeenCalledWith(input, {
      solvedAt: expect.any(String),
      appVersion: 'test',
    })
  })

  it('shows the warnings above the table and highlights the cells of a hovered one', () => {
    renderScreen(withRoster(base))
    expect(screenTable().getByText('Dajka: N1 (DE, nyit)').className).toBe('bold')
    const empty = screenTable().getByText('DU: BETÖLTETLEN')
    expect(empty.className).toBe('hole')
    fireEvent.mouseEnter(screen.getByText('2. cs.: nincs délutános óvónő (10:30–17:00).'))
    expect(empty.closest('td')?.className).toBe('highlight')
  })

  it('reduces the day and solves again with one click', async () => {
    vi.mocked(solveInWorker).mockResolvedValue(roster)
    const state = withRoster(base)
    const dispatch = renderScreen(state)
    fireEvent.click(screen.getByText('Szerdán 1 csoport'))
    const action: Action = { type: 'setOverride', week: WEEK, date: WED, groups: 1 }
    expect(dispatch).toHaveBeenCalledWith(action)
    const reduced = solveInputFor(reducer(state, action), WEEK)
    await waitFor(() => expect(solveInWorker).toHaveBeenCalledWith(reduced, expect.anything()))
  })

  it('offers calling in someone absent that day, then solves again', async () => {
    vi.mocked(solveInWorker).mockResolvedValue(roster)
    const state = withRoster(
      reducer(base, { type: 'setAbsent', staffId: 't4', dates: [WED], absent: true }),
    )
    const dispatch = renderScreen(state)
    fireEvent.click(screen.getByText('T4 mégis jön'))
    const action: Action = { type: 'setAbsent', staffId: 't4', dates: [WED], absent: false }
    expect(dispatch).toHaveBeenCalledWith(action)
    const back = solveInputFor(reducer(state, action), WEEK)
    await waitFor(() => expect(solveInWorker).toHaveBeenCalledWith(back, expect.anything()))
  })

  it('groups the warnings by day and folds the grey notes away', () => {
    const note: Warning = {
      code: 'UNEVEN',
      severity: 'grey',
      date: WED,
      text: 'Egyenlő elosztás nem volt lehetséges: T1 2 délelőttös műszak az 5-ből.',
      cells: [{ date: WED }],
    }
    const state = reducer(base, {
      type: 'saveRoster',
      week: WEEK,
      roster: { ...roster, warnings: [hole, note] },
      inputKey: inputKey(solveInputFor(base, WEEK)),
    })
    renderScreen(state)
    const card = within(screen.getByRole('region', { name: /Szerda 10\.28\./ }))
    expect(card.getByText('1 hiány')).toBeTruthy()
    expect(card.getByText('2. cs.: nincs délutános óvónő (10:30–17:00).')).toBeTruthy()
    const notes = screen.getByText('Egyéb megjegyzések (1)').closest('details')!
    expect(notes.open).toBe(false)
    expect(within(notes).getByText(note.text)).toBeTruthy()
  })

  it('greys out an outdated roster and offers solving again right there', async () => {
    vi.mocked(solveInWorker).mockResolvedValue(roster)
    renderScreen(withRoster(base, 'old'))
    const banner = within(screen.getByRole('status'))
    expect(banner.getByText(/változott a számolás óta/)).toBeTruthy()
    expect(document.querySelector('.result')?.className).toBe('result outdated')
    expect(screen.getByText('Számol').className).toContain('attention')
    fireEvent.click(banner.getByText('Újraszámol'))
    await waitFor(() => expect(solveInWorker).toHaveBeenCalled())
  })

  it('shows a renamed person by the new name in a saved roster', () => {
    const substitution: Warning = {
      code: 'SUBSTITUTION',
      severity: 'orange',
      date: WED,
      text: `Szerda, 2. cs.: dajka helyett óvónő — ${nameRef('t4')}.`,
      cells: [{ staffId: 't4', date: WED, group: 2 }],
    }
    const saved = reducer(base, {
      type: 'saveRoster',
      week: WEEK,
      roster: { ...roster, warnings: [substitution] },
      inputKey: inputKey(solveInputFor(base, WEEK)),
    })
    renderScreen(reducer(saved, { type: 'updateStaff', id: 't4', patch: { displayName: 'Tímea' } }))
    expect(screen.getByText('2. cs.: dajka helyett óvónő — Tímea.')).toBeTruthy()
  })

  it('says so when the solver stopped early, and nothing when it finished', () => {
    const early = reducer(base, {
      type: 'saveRoster',
      week: WEEK,
      roster: { ...roster, stoppedEarly: 'switches' },
      inputKey: inputKey(solveInputFor(base, WEEK)),
    })
    renderScreen(early)
    expect(screen.getByText(/időkorlát miatt hamarabb leállt/)).toBeTruthy()
    cleanup()
    renderScreen(withRoster(base))
    expect(screen.queryByText(/időkorlát miatt hamarabb leállt/)).toBeNull()
  })

  it('reports a failed solve in words', async () => {
    vi.mocked(solveInWorker).mockRejectedValue(new SolveFailure('invalid'))
    renderScreen(base)
    fireEvent.click(screen.getByText('Számol'))
    expect(await screen.findByText('Hiba történt a beosztás készítésekor.')).toBeTruthy()
  })
})

describe('PrintView', () => {
  it('prints both pages, the footnotes and the legend', () => {
    render(<PrintView roster={roster} staff={base.staff} absences={[]} />)
    expect(screen.getByText('Beosztás — 2026. október 26 – 30.')).toBeTruthy()
    expect(screen.getByText('Beosztás munkatársanként — 2026. október 26 – 30.')).toBeTruthy()
    expect(screen.getByText(`* ${hole.text} ${hole.action}`)).toBeTruthy()
    expect(screen.getByText('DE · 1. cs. · nyit').className).toBe('fill-morning bold')
    expect(screen.getAllByText(/^Dajka: DE 6:00–14:00/)).toHaveLength(2)
  })
})

// A real reducer and undo history, to follow a fix through to its undo.
function Harness({ initial }: { initial: AppState }) {
  const [state, dispatch] = useReducer(reducer, initial)
  const history = useUndo(dispatch)
  return (
    <RosterScreen
      state={state}
      dispatch={dispatch}
      week={WEEK}
      onWeek={() => {}}
      history={history}
    />
  )
}

// What the solver returns after the fix: T4 takes the empty afternoon seat.
const fixed: Roster = {
  ...roster,
  assignments: roster.assignments.map((a) =>
    a.staffId === 't4'
      ? { ...a, shift: 'afternoon', seat: { kind: 'teacher', group: 2, shift: 'afternoon' } }
      : a,
  ),
  holes: [],
  warnings: [],
}

describe('RosterScreen undo', () => {
  it('marks what a quick fix changed, and undoes it with one click', async () => {
    vi.mocked(solveInWorker).mockResolvedValue(fixed)
    render(<Harness initial={withRoster(base)} />)
    fireEvent.click(screen.getByText('Szerdán 1 csoport'))
    expect(await screen.findByText('Szerdán 1 csoport beállítva.')).toBeTruthy()
    expect(screen.getByText('2 cella változott — kiemelve a táblázatban.')).toBeTruthy()
    expect(document.querySelectorAll('td.changed')).toHaveLength(2)
    fireEvent.click(screen.getByText('↶ Visszavonás'))
    expect(screen.queryByText('Szerdán 1 csoport beállítva.')).toBeNull()
    expect(document.querySelectorAll('td.changed')).toHaveLength(0)
    expect(screen.getByText('Szerdán 1 csoport')).toBeTruthy() // the old roster is back
    expect(screen.queryByText(/változott a számolás óta/)).toBeNull() // and it is current
  })

  it('puts a sick day back as sick when a call-in is undone', async () => {
    vi.mocked(solveInWorker).mockResolvedValue(fixed)
    const away = reducer(base, {
      type: 'setAbsent',
      staffId: 't4',
      dates: [WED],
      absent: true,
      kind: 'sick',
    })
    render(<Harness initial={withRoster(away)} />)
    fireEvent.click(screen.getByText('T4 mégis jön (beteg)'))
    expect(await screen.findByText('T4 mégis jön szerdán.')).toBeTruthy()
    fireEvent.click(screen.getByText('↶ Visszavonás'))
    expect(screen.getByText('T4 mégis jön (beteg)')).toBeTruthy()
  })

  it('puts the absence back when a call-in is undone', async () => {
    vi.mocked(solveInWorker).mockResolvedValue(fixed)
    const away = reducer(base, { type: 'setAbsent', staffId: 't4', dates: [WED], absent: true })
    render(<Harness initial={withRoster(away)} />)
    fireEvent.click(screen.getByText('T4 mégis jön'))
    expect(await screen.findByText('T4 mégis jön szerdán.')).toBeTruthy()
    fireEvent.click(screen.getByText('↶ Visszavonás'))
    expect(screen.getByText('T4 mégis jön')).toBeTruthy()
    expect(screen.queryByText(/változott a számolás óta/)).toBeNull()
  })

  it('keeps the change and clears the marks on Rendben', async () => {
    vi.mocked(solveInWorker).mockResolvedValue(fixed)
    render(<Harness initial={withRoster(base, 'old')} />)
    fireEvent.click(screen.getByText('Újraszámol'))
    expect(await screen.findByText('Újraszámolva.')).toBeTruthy()
    fireEvent.click(screen.getByText('Rendben'))
    expect(screen.queryByText('↶ Visszavonás')).toBeNull()
    expect(document.querySelectorAll('td.changed')).toHaveLength(0)
    expect(screen.queryByText('Szerdán 1 csoport')).toBeNull()
  })
})

describe('RosterScreen archive', () => {
  it('shows a past week read-only: its roster, but nothing to solve or fix', () => {
    vi.setSystemTime(new Date(2026, 10, 10, 12))
    renderScreen(withRoster(base, 'old')) // outdated inputs make no difference once it is over
    expect(screen.getByText('Archív')).toBeTruthy()
    expect(screen.getByText(/Ez a hét már elmúlt/)).toBeTruthy()
    expect(screen.getByText('2. cs.: nincs délutános óvónő (10:30–17:00).')).toBeTruthy()
    expect(screen.getByText('Nyomtatás')).toBeTruthy()
    for (const gone of ['Számol', 'Újraszámol', 'Szerdán 1 csoport', 'Csoportok:']) {
      expect(screen.queryByText(gone)).toBeNull()
    }
    expect(screen.queryByText(/változott a számolás óta/)).toBeNull()
    expect(document.querySelector('.capacity')).toBeNull()
  })

  it('says so when a past week has no saved roster', () => {
    vi.setSystemTime(new Date(2026, 10, 10, 12))
    renderScreen(base)
    expect(screen.getByText('Ehhez a héthez nincs mentett beosztás.')).toBeTruthy()
    expect(screen.queryByText('Számol')).toBeNull()
  })

  it('keeps the week in progress open, for a sick call', () => {
    vi.setSystemTime(new Date(2026, 9, 28, 12))
    renderScreen(withRoster(base))
    expect(screen.queryByText('Archív')).toBeNull()
    expect(screen.getByText('Számol')).toBeTruthy()
  })

  it('keeps it open on its last working day', () => {
    vi.setSystemTime(new Date(2026, 9, 30, 12)) // Friday
    renderScreen(withRoster(base))
    expect(screen.queryByText('Archív')).toBeNull()
  })

  it('archives it once the last working day is over, weekend or not', () => {
    vi.setSystemTime(new Date(2026, 10, 1, 12)) // the Sunday after
    renderScreen(withRoster(base))
    expect(screen.getByText('Archív')).toBeTruthy()
  })
})

// A week open only on Wednesday, so the fixture roster passes every strict rule.
const wedOnly = DAYS.filter((d) => d !== WED).reduce(
  (state, date) => reducer(state, { type: 'setOverride', week: WEEK, date, groups: 0 }),
  base,
)
const valid: Roster = {
  ...roster,
  groupsPerDay: Object.fromEntries(DAYS.map((d) => [d, d === WED ? 2 : 0])),
}
const withValid = reducer(wedOnly, {
  type: 'saveRoster',
  week: WEEK,
  roster: valid,
  inputKey: inputKey(solveInputFor(wedOnly, WEEK)),
})

describe('RosterScreen swap', () => {
  it('swaps two people on the same day, marks both cells, and undoes it', () => {
    render(<Harness initial={withValid} />)
    fireEvent.click(screenTable().getByText('DE: T2'))
    expect(screen.getByText('T2 kiválasztva (szerda) — kattints arra, akivel cserél.')).toBeTruthy()
    fireEvent.click(screenTable().getByText('DE: T1'))
    expect(screen.getByText('Csere: T2 ↔ T1, szerda.')).toBeTruthy()
    expect(document.querySelectorAll('td.changed')).toHaveLength(2)
    expect(screen.getByText('kézzel módosítva')).toBeTruthy()
    fireEvent.click(screen.getByText('↶ Visszavonás'))
    expect(screen.queryByText('kézzel módosítva')).toBeNull()
    expect(document.querySelectorAll('td.changed')).toHaveLength(0)
  })

  it('refuses a swap that breaks a rule, and changes nothing', () => {
    render(<Harness initial={withValid} />)
    fireEvent.click(screenTable().getByText('Dajka: N1 (DE, nyit)'))
    fireEvent.click(screenTable().getByText('T4 (DE)'))
    expect(
      screen.getByText('Ez a csere nem lehetséges: nyitni és zárni csak dajka tud.'),
    ).toBeTruthy()
    expect(screen.queryByText('↶ Visszavonás')).toBeNull()
    expect(screenTable().getByText('Dajka: N1 (DE, nyit)')).toBeTruthy()
  })

  it('drops the selection on Mégse, on Escape, or on the same name again', () => {
    render(<Harness initial={withValid} />)
    const bar = /kiválasztva/
    fireEvent.click(screenTable().getByText('DE: T2'))
    fireEvent.click(screen.getByText('Mégse'))
    expect(screen.queryByText(bar)).toBeNull()
    fireEvent.click(screenTable().getByText('DE: T2'))
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByText(bar)).toBeNull()
    fireEvent.click(screenTable().getByText('DE: T2'))
    fireEvent.click(screenTable().getByText('DE: T2'))
    expect(screen.queryByText(bar)).toBeNull()
  })

  it('offers no swaps in an archived week', () => {
    vi.setSystemTime(new Date(2026, 10, 10, 12))
    render(<Harness initial={withValid} />)
    fireEvent.click(screenTable().getByText('DE: T2'))
    expect(screen.queryByText(/kiválasztva/)).toBeNull()
  })

  it('asks before re-solving drops hand edits', () => {
    const edited = reducer(withValid, {
      type: 'saveRoster',
      week: WEEK,
      roster: { ...valid, edited: true },
      inputKey: inputKey(solveInputFor(wedOnly, WEEK)),
    })
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<Harness initial={edited} />)
    fireEvent.click(screen.getByText('Számol'))
    expect(confirm).toHaveBeenCalledWith('A kézi cserék elvesznek. Újraszámolod?')
    expect(solveInWorker).not.toHaveBeenCalled()
    confirm.mockRestore()
  })
})
