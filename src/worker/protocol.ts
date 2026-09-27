import type { Roster, RosterMeta, SolveInput } from '../core/types'

export type SolveRequest = { id: number; input: SolveInput; meta: RosterMeta }

export type SolveResponse =
  | { id: number; ok: true; roster: Roster }
  | { id: number; ok: false; reason: 'invalid' | 'crash'; detail: string }
