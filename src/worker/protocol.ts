import type { Anchor, Roster, RosterMeta, SolveInput } from '../core/types'

export type SolveRequest = { id: number; input: SolveInput; meta: RosterMeta; anchor?: Anchor }

export type SolveResponse =
  | { id: number; ok: true; roster: Roster }
  | { id: number; ok: false; reason: 'invalid' | 'crash'; detail: string }
