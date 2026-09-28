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
  it('lists who changed under a recalculation', () => {
    const details = ['1 munkatárs beosztása változott:', 'Bea: ma DE 6:00–14:00, 1. cs. (eddig …)']
    render(<UndoBar change={{ ...change, details }} busy={false} onUndo={noop} onAccept={noop} />)
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual(details)
  })

  it('shows no list for an ordinary change', () => {
    render(<UndoBar change={change} busy={false} onUndo={noop} onAccept={noop} />)
    expect(screen.queryByRole('list')).toBeNull()
  })
})
