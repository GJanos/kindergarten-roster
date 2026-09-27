// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TEST_META, makeStaff } from '../core/fixtures'
import type { Roster, Warning } from '../../src/core/types'
import { emptyState, reducer, type Action, type AppState } from '../../src/state/appState'
import { inputKey, solveInputFor } from '../../src/state/solveInput'
import { SolveFailure, solveInWorker } from '../../src/worker/client'
import { PrintView } from '../../src/ui/PrintView'
import { RosterScreen } from '../../src/ui/RosterScreen'

// The real client would start a Web Worker; keep SolveFailure, fake the solve.
vi.mock(import('../../src/worker/client'), async (importOriginal) => ({
  ...(await importOriginal()),
  solveInWorker: vi.fn(),
}))

beforeEach(() => {
  vi.mocked(solveInWorker).mockReset()
})
afterEach(cleanup)

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

function renderScreen(state: AppState) {
  const dispatch = vi.fn<(action: Action) => void>()
  render(<RosterScreen state={state} dispatch={dispatch} week={WEEK} onWeek={() => {}} />)
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
