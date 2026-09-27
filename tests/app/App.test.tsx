// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearState, loadState, saveState } from '../../src/state/storage'
import { defaultWeek, periodForWeek } from '../../src/core/calendar'
import type { Roster, Warning } from '../../src/core/types'
import { emptyState, reducer } from '../../src/state/appState'
import { TEST_META, makeStaff } from '../core/fixtures'
import { App } from '../../src/app/App'

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 5, 12))
  await clearState()
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('App', () => {
  it('offers three ways to start, and opens the demo on the roster tab', async () => {
    render(<App />)
    expect(await screen.findByText('Új kezdés')).toBeTruthy()
    expect(screen.getByText('Visszatöltés fájlból')).toBeTruthy()
    fireEvent.click(screen.getByText('Bemutató adatok'))
    expect(screen.getByText('Bemutató adatok — nem valódi személyek')).toBeTruthy()
    expect(screen.getByText('2026. október 26 – 30.')).toBeTruthy()
    expect(screen.getByText('Számol')).toBeTruthy()
    expect(screen.getByText('még nem volt').closest('footer')?.className).toBe('footer overdue')
    fireEvent.click(screen.getByText('Kilépés a bemutatóból'))
    expect(await screen.findByText('Hogyan kezdjük?')).toBeTruthy()
  })

  it('keeps her data after the page is closed', async () => {
    render(<App />)
    fireEvent.click(await screen.findByText('Új kezdés'))
    fireEvent.click(screen.getByText('+ Új óvónő'))
    await waitFor(async () => expect((await loadState())?.staff).toHaveLength(1))
    cleanup()
    render(<App />)
    fireEvent.click(await screen.findByText('Munkatársak')) // with staff, it opens on the roster
    expect(screen.getByLabelText('Teljes név')).toBeTruthy()
  })

  it('counts on the Beosztás tab exactly the warnings the roster screen lists', async () => {
    const week = defaultWeek('2026-10-05')
    const date = periodForWeek(week).days[0]
    const warning = (code: Warning['code'], severity: Warning['severity']): Warning => ({
      code,
      severity,
      date,
      text: code,
      cells: [{ date }],
    })
    const roster: Roster = {
      period: periodForWeek(week),
      groupsPerDay: {},
      assignments: [],
      holes: [],
      warnings: [warning('TEACHER_SEAT_EMPTY', 'red'), warning('UNEVEN', 'grey')],
      ...TEST_META,
    }
    const state = reducer(
      { ...emptyState(), staff: makeStaff(1, 1) },
      { type: 'saveRoster', week, roster, inputKey: 'k' },
    )
    await saveState(state)
    render(<App />)
    const tab = await screen.findByText('Beosztás')
    expect(tab.querySelector('.badge')?.textContent).toBe('1')
  })
})
