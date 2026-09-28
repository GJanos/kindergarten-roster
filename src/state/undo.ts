import { useCallback, useRef, useState } from 'react'
import type { Action } from './appState'

export const UNDO_LIMIT = 20

/**
 * One undoable change on the roster screen (a quick fix, a call-in, Számol). `undo` puts back
 * only what the change touched — the day's input and the earlier roster — so edits made since
 * survive; `changed` holds the table cells it altered, as `row|date` keys.
 */
export type UndoEntry = {
  id: number
  week: string
  label: string
  undo: Action[]
  changed: string[]
  details?: UndoDetail[] // a recalculation's changed people, grouped under headings
}

/** A heading and its lines, e.g. the people to phone after a recalculation. */
export type UndoDetail = { title: string; items: string[] }

/** In memory only: undo is for the last few clicks, not across visits. */
export function useUndo(dispatch: (action: Action) => void) {
  const [entries, setEntries] = useState<UndoEntry[]>([])
  const nextId = useRef(0)

  const record = useCallback((entry: Omit<UndoEntry, 'id'>) => {
    const id = nextId.current++
    setEntries((current) => [...current, { ...entry, id }].slice(-UNDO_LIMIT))
  }, [])

  const undo = useCallback(
    (entry: UndoEntry) => {
      entry.undo.forEach(dispatch)
      setEntries((current) => current.filter((e) => e.id !== entry.id))
    },
    [dispatch],
  )

  /** "Rendben": she keeps the week's changes, and they leave the undo list. */
  const accept = useCallback((week: string) => {
    setEntries((current) => current.filter((e) => e.week !== week))
  }, [])

  const reset = useCallback(() => setEntries([]), [])

  const latest = (week: string) => [...entries].reverse().find((e) => e.week === week)

  return { entries, record, undo, accept, reset, latest }
}

export type UndoHistory = ReturnType<typeof useUndo>
