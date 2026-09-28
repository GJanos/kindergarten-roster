// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { UndoEntry } from '../../src/state/undo'
import { UndoBar } from '../../src/ui/UndoBar'

afterEach(cleanup)

const change: UndoEntry = {
  id: 1,
  week: '2026-10-26',
  label: 'Kati beteg: 10.28.',
  undo: [],
  changed: ['0|2026-10-28'],
}
const noop = () => {}

describe('UndoBar', () => {
  it('shows each group of changed people under its heading', () => {
    const details = [
      { title: '1 munkatárs ideje változott — őket érdemes felhívni:', items: ['Bea — ma: …'] },
      { title: '1 munkatársnak csak a helye vagy a kulcsa változott:', items: ['Cili — kedd: …'] },
    ]
    render(<UndoBar change={{ ...change, details }} busy={false} onUndo={noop} onAccept={noop} />)
    expect(screen.getByText(details[0].title)).toBeTruthy()
    expect(screen.getByText(details[1].title)).toBeTruthy()
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'Bea — ma: …',
      'Cili — kedd: …',
    ])
  })

  it('shows a heading without a list when nobody changed', () => {
    const details = [{ title: 'Senki más beosztása nem változott.', items: [] }]
    render(<UndoBar change={{ ...change, details }} busy={false} onUndo={noop} onAccept={noop} />)
    expect(screen.getByText('Senki más beosztása nem változott.')).toBeTruthy()
    expect(screen.queryByRole('list')).toBeNull()
  })

  it('shows nothing extra for an ordinary change', () => {
    render(<UndoBar change={change} busy={false} onUndo={noop} onAccept={noop} />)
    expect(screen.queryByRole('list')).toBeNull()
    expect(document.querySelector('.undo-details')).toBeNull()
  })
})
