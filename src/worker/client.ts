import type { Roster, RosterMeta, SolveInput } from '../core/types'
import type { SolveRequest, SolveResponse } from './protocol'

/** Every solver stage stops itself (STAGE_TIME_LIMIT); this outlasts all of them and only catches a hang. */
export const SOLVE_TIMEOUT_MS = 150_000

export class SolveFailure extends Error {
  constructor(
    readonly reason: 'timeout' | 'crash' | 'invalid',
    detail = '',
  ) {
    super(`${reason}${detail ? `: ${detail}` : ''}`)
    this.name = 'SolveFailure'
  }
}

let worker: Worker | undefined
let nextId = 1

function freshWorker(): Worker {
  worker ??= new Worker(new URL('./solver.worker.ts', import.meta.url), { type: 'module' })
  return worker
}

/** Solves off the main thread, so the page stays responsive; a stuck worker is replaced. */
export function solveInWorker(input: SolveInput, meta: RosterMeta): Promise<Roster> {
  const current = freshWorker()
  const id = nextId++
  return new Promise((resolve, reject) => {
    const finish = () => {
      clearTimeout(timer)
      current.removeEventListener('message', onMessage)
      current.removeEventListener('error', onError)
    }
    const discard = () => {
      current.terminate()
      if (worker === current) worker = undefined
    }
    const onMessage = (event: MessageEvent<SolveResponse>) => {
      if (event.data.id !== id) return
      finish()
      if (event.data.ok) resolve(event.data.roster)
      else reject(new SolveFailure(event.data.reason, event.data.detail))
    }
    const onError = (event: ErrorEvent) => {
      finish()
      discard()
      reject(new SolveFailure('crash', event.message))
    }
    const timer = setTimeout(() => {
      finish()
      discard()
      reject(new SolveFailure('timeout'))
    }, SOLVE_TIMEOUT_MS)
    current.addEventListener('message', onMessage)
    current.addEventListener('error', onError)
    current.postMessage({ id, input, meta } satisfies SolveRequest)
  })
}
