// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { emptyState, reducer, type Action } from '../../src/state/appState'
import { AbsenceScreen } from '../../src/ui/AbsenceScreen'
import { makeStaff } from '../core/fixtures'

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 5, 12))
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const actions: Action[] = [
  { type: 'addStaff', id: 'n' },
  {
    type: 'updateStaff',
    id: 'n',
    patch: { fullName: 'Nagy Nóra', displayName: 'Nóra', role: 'nanny' },
  },
  { type: 'addStaff', id: 'a' },
  { type: 'updateStaff', id: 'a', patch: { fullName: 'Kiss Anna', displayName: 'Anna' } },
]
const state = actions.reduce(reducer, emptyState())

function renderScreen() {
  const dispatch = vi.fn<(action: Action) => void>()
  render(<AbsenceScreen state={state} dispatch={dispatch} />)
  return dispatch
}

describe('AbsenceScreen', () => {
  it('shows this month, teachers first', () => {
    renderScreen()
    expect(screen.getByText('2026. október')).toBeTruthy()
    expect(screen.getAllByText(/^(Anna|Nóra)$/).map((cell) => cell.textContent)).toEqual([
      'Anna',
      'Nóra',
    ])
  })

  it('heads the teachers and the nannies with a row each, keeping the day columns aligned', () => {
    renderScreen()
    const heads = screen.getAllByRole('rowheader').filter((h) => h.className === 'section')
    expect(heads.map((h) => h.textContent)).toEqual(['Óvónők', 'Dajkák'])
    expect(heads[0].getAttribute('colspan')).toBe(
      String(document.querySelectorAll('thead th').length),
    )
  })

  it('marks a day, and a stretch by dragging along the row', () => {
    const dispatch = renderScreen()
    fireEvent.pointerDown(screen.getByLabelText('Anna 2026-10-26'))
    fireEvent.pointerEnter(screen.getByLabelText('Anna 2026-10-27'))
    fireEvent.pointerEnter(screen.getByLabelText('Nóra 2026-10-27')) // another row: ignored
    fireEvent.pointerUp(window)
    fireEvent.pointerEnter(screen.getByLabelText('Anna 2026-10-28')) // released: ignored
    expect(dispatch.mock.calls.map(([action]) => action)).toEqual([
      { type: 'setAbsent', staffId: 'a', dates: ['2026-10-26'], absent: true, kind: 'leave' },
      { type: 'setAbsent', staffId: 'a', dates: ['2026-10-27'], absent: true, kind: 'leave' },
    ])
  })

  it('leaves weekends and holidays out', () => {
    renderScreen()
    expect(screen.queryByLabelText('Anna 2026-10-24')).toBeNull() // Saturday
    expect(screen.queryByLabelText('Anna 2026-10-23')).toBeNull() // national holiday
    expect(screen.getByLabelText('Anna 2026-10-22')).toBeTruthy()
  })

  it('moves between months', () => {
    renderScreen()
    fireEvent.click(screen.getByLabelText('Következő hónap'))
    expect(screen.getByText('2026. november')).toBeTruthy()
  })

  it('draws a run of absent days as one bar, broken by the weekend', () => {
    const away = reducer(state, {
      type: 'setAbsent',
      staffId: 'a',
      dates: ['2026-10-22', '2026-10-26', '2026-10-27', '2026-10-28'],
      absent: true,
    })
    render(<AbsenceScreen state={away} dispatch={vi.fn()} />)
    const cell = (date: string) => screen.getByLabelText(`Anna ${date}`).className
    expect(cell('2026-10-22')).toBe('absent leave') // Thursday; Friday is a holiday
    expect(cell('2026-10-26')).toBe('absent leave join-right')
    expect(cell('2026-10-27')).toBe('absent leave join-left join-right')
    expect(cell('2026-10-28')).toBe('absent leave join-left')
    expect(cell('2026-10-29')).toBe('')
  })
})

describe('AbsenceScreen kinds', () => {
  const on = (kind: 'leave' | 'sick' | 'other', date: string): Action => ({
    type: 'setAbsent',
    staffId: 'a',
    dates: [date],
    absent: true,
    kind,
  })

  it('paints the chosen kind', () => {
    const dispatch = vi.fn<(action: Action) => void>()
    render(<AbsenceScreen state={state} dispatch={dispatch} />)
    fireEvent.click(screen.getByText('Beteg'))
    fireEvent.pointerDown(screen.getByLabelText('Anna 2026-10-26'))
    expect(dispatch).toHaveBeenCalledWith(on('sick', '2026-10-26'))
  })

  it('clears a day of the chosen kind, and repaints a day of another kind', () => {
    const away = reducer(state, on('leave', '2026-10-26'))
    const dispatch = vi.fn<(action: Action) => void>()
    render(<AbsenceScreen state={away} dispatch={dispatch} />)
    fireEvent.pointerDown(screen.getByLabelText('Anna 2026-10-26'))
    expect(dispatch).toHaveBeenLastCalledWith({
      type: 'setAbsent',
      staffId: 'a',
      dates: ['2026-10-26'],
      absent: false,
    })
    fireEvent.pointerUp(window)
    fireEvent.click(screen.getByText('Beteg'))
    fireEvent.pointerDown(screen.getByLabelText('Anna 2026-10-26'))
    expect(dispatch).toHaveBeenLastCalledWith(on('sick', '2026-10-26'))
  })

  it('draws each kind as its own bar, joined only with the same kind, lettered once', () => {
    const away = [
      on('leave', '2026-10-26'),
      on('leave', '2026-10-27'),
      on('sick', '2026-10-28'),
    ].reduce(reducer, state)
    render(<AbsenceScreen state={away} dispatch={vi.fn()} />)
    const cell = (date: string) => screen.getByLabelText(`Anna ${date}`)
    expect(cell('2026-10-26').className).toBe('absent leave join-right')
    expect(cell('2026-10-27').className).toBe('absent leave join-left')
    expect(cell('2026-10-28').className).toBe('absent sick')
    expect(cell('2026-10-26').textContent).toBe('Sz')
    expect(cell('2026-10-27').textContent).toBe('')
    expect(cell('2026-10-28').textContent).toBe('B')
  })

  it("shows the shown year's leave balance and edits that year's carry-over", () => {
    const steps: Action[] = [
      { type: 'updateStaff', id: 'a', patch: { leaveAllowance: 50, leaveCarry: { '2026': 3 } } },
      on('leave', '2026-10-26'),
      on('leave', '2026-10-27'),
      on('sick', '2026-10-28'),
    ]
    const tracked = steps.reduce(reducer, state)
    const dispatch = vi.fn<(action: Action) => void>()
    render(<AbsenceScreen state={tracked} dispatch={dispatch} />)
    expect(screen.getByText('Szabadság 2026')).toBeTruthy()
    fireEvent.click(screen.getByText('2 / 53'))
    const carry = screen.getByLabelText('Áthozott napok (2026)') as HTMLInputElement
    expect(carry.value).toBe('3')
    fireEvent.change(carry, { target: { value: '5' } })
    expect(dispatch).toHaveBeenLastCalledWith({
      type: 'updateStaff',
      id: 'a',
      patch: { leaveCarry: { '2026': 5 } },
    })
  })
})

describe('AbsenceScreen at a glance', () => {
  const header = (text: string) =>
    [...document.querySelectorAll('thead th')].find((th) => th.textContent === text)!

  it("outlines today's column and tints the school-break days", () => {
    render(<AbsenceScreen state={state} dispatch={vi.fn()} />)
    expect(header('H5').className).toBe('today') // Monday 5 October, today in these tests
    expect(screen.getByLabelText('Anna 2026-10-05').className).toBe('today')
    expect(header('H26').className).toBe('break') // the autumn break
    expect(header('P23').className).toBe('off break') // a holiday inside the break
    expect(header('K6').className).toBe('')
  })

  it('counts who is away per role, orange when too few are left for the week’s groups', () => {
    // 5 teachers, 2 nannies, 2 groups (the default): zero holes needs 4 teachers and 2 nannies.
    const away = (staffId: string, date: string): Action => ({
      type: 'setAbsent',
      staffId,
      dates: [date],
      absent: true,
    })
    const crew = [
      away('t1', '2026-10-26'),
      away('t2', '2026-10-26'),
      away('t1', '2026-10-27'),
    ].reduce(reducer, { ...emptyState(), staff: makeStaff(5, 2) })
    render(<AbsenceScreen state={crew} dispatch={vi.fn()} />)
    const teachers = (date: string) => screen.getByLabelText(`Távol (óvónő) ${date}`)
    expect(teachers('2026-10-26').textContent).toBe('2')
    expect(teachers('2026-10-26').className).toBe('count short') // 3 left, 4 needed
    expect(teachers('2026-10-27').textContent).toBe('1')
    expect(teachers('2026-10-27').className).toBe('count') // 4 left
    expect(screen.getByLabelText('Távol (dajka) 2026-10-26').textContent).toBe('')
  })
})
