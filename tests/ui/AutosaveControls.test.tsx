// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AutosaveControls } from '../../src/ui/AutosaveControls'
import type { Autosave, AutosaveStatus } from '../../src/ui/useAutosave'

afterEach(cleanup)

function stub(status: AutosaveStatus, rest: Partial<Autosave> = {}): Autosave {
  return {
    status,
    minutes: 5,
    enable: vi.fn(async () => {}),
    disable: vi.fn(async () => {}),
    allow: vi.fn(async () => {}),
    retry: vi.fn(async () => {}),
    setMinutes: vi.fn(async () => {}),
    ...rest,
  }
}

describe('AutosaveControls', () => {
  it('offers switching it on, which opens the folder picker', () => {
    const auto = stub('off')
    render(<AutosaveControls auto={auto} />)
    fireEvent.click(screen.getByText('Automatikus mentés…'))
    expect(auto.enable).toHaveBeenCalled()
  })

  it('shows when and where it last saved, the interval, and switching off', () => {
    const auto = stub('on', {
      folder: 'Mentések',
      fileName: 'ovoda-mentes-2026-10-18.json',
      savedAt: new Date(2026, 9, 18, 10, 42).toISOString(),
    })
    render(<AutosaveControls auto={auto} />)
    expect(
      screen.getByText('Automatikus mentés: 10:42 → Mentések/ovoda-mentes-2026-10-18.json'),
    ).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Automatikus mentés gyakorisága'), {
      target: { value: '15' },
    })
    expect(auto.setMinutes).toHaveBeenCalledWith(15)
    fireEvent.click(screen.getByText('Kikapcsolás'))
    expect(auto.disable).toHaveBeenCalled()
  })

  it('names the folder before the first save of the session', () => {
    render(<AutosaveControls auto={stub('on', { folder: 'Mentések' })} />)
    expect(screen.getByText('Automatikus mentés bekapcsolva → Mentések')).toBeTruthy()
  })

  it('asks loudly for the folder again when paused', () => {
    const auto = stub('paused', { folder: 'Mentések' })
    render(<AutosaveControls auto={auto} />)
    expect(screen.getByText(/Az automatikus mentés szünetel/)).toBeTruthy()
    fireEvent.click(screen.getByText('Engedélyezés'))
    expect(auto.allow).toHaveBeenCalled()
  })

  it('says a save failed and offers another try', () => {
    const auto = stub('failed')
    render(<AutosaveControls auto={auto} />)
    expect(screen.getByText(/nem sikerült/)).toBeTruthy()
    fireEvent.click(screen.getByText('Újra'))
    expect(auto.retry).toHaveBeenCalled()
  })

  it('says the demo is not saved, and shows nothing where the browser cannot', () => {
    render(<AutosaveControls auto={stub('demo')} />)
    expect(screen.getByText('Bemutató módban nincs automatikus mentés.')).toBeTruthy()
    cleanup()
    const { container } = render(<AutosaveControls auto={stub('unsupported')} />)
    expect(container.textContent).toBe('')
  })
})
