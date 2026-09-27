import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TEST_META, makeInput } from '../core/fixtures'
import type { Roster } from '../../src/core/types'
import type { SolveRequest, SolveResponse } from '../../src/worker/protocol'

/** Stands in for the browser's Worker: answers each request as `reply` says. */
class FakeWorker extends EventTarget {
  static reply: (request: SolveRequest) => SolveResponse | 'crash' | 'hang'
  static made: FakeWorker[] = []
  terminated = false

  constructor() {
    super()
    FakeWorker.made.push(this)
  }

  postMessage(request: SolveRequest) {
    const answer = FakeWorker.reply(request)
    queueMicrotask(() => {
      if (answer === 'crash') {
        this.dispatchEvent(Object.assign(new Event('error'), { message: 'boom' }))
      } else if (answer !== 'hang') {
        this.dispatchEvent(new MessageEvent('message', { data: answer }))
      }
    })
  }

  terminate() {
    this.terminated = true
  }
}

const input = makeInput({ teachers: 2, nannies: 2, groups: 1 })
const roster = {
  period: input.period,
  groupsPerDay: {},
  assignments: [],
  holes: [],
  warnings: [],
  ...TEST_META,
} satisfies Roster
const solved = ({ id }: SolveRequest): SolveResponse => ({ id, ok: true, roster })

// The client keeps its worker in module state, so every test loads a fresh copy.
const loadClient = () => import('../../src/worker/client')

beforeEach(() => {
  vi.resetModules()
  vi.stubGlobal('Worker', FakeWorker)
  FakeWorker.made = []
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('solveInWorker', () => {
  it('resolves with the roster and keeps the worker for the next solve', async () => {
    FakeWorker.reply = solved
    const { solveInWorker } = await loadClient()
    await expect(solveInWorker(input, TEST_META)).resolves.toEqual(roster)
    await expect(solveInWorker(input, TEST_META)).resolves.toEqual(roster)
    expect(FakeWorker.made).toHaveLength(1)
  })

  it('rejects a roster that failed the check', async () => {
    FakeWorker.reply = ({ id }) => ({ id, ok: false, reason: 'invalid', detail: '[]' })
    const { solveInWorker } = await loadClient()
    await expect(solveInWorker(input, TEST_META)).rejects.toMatchObject({ reason: 'invalid' })
    expect(FakeWorker.made[0].terminated).toBe(false)
  })

  it('replaces a worker that crashed', async () => {
    FakeWorker.reply = () => 'crash'
    const { solveInWorker } = await loadClient()
    await expect(solveInWorker(input, TEST_META)).rejects.toMatchObject({ reason: 'crash' })
    expect(FakeWorker.made[0].terminated).toBe(true)
    FakeWorker.reply = solved
    await expect(solveInWorker(input, TEST_META)).resolves.toEqual(roster)
    expect(FakeWorker.made).toHaveLength(2)
  })

  it('gives up on a worker that hangs', async () => {
    FakeWorker.reply = () => 'hang'
    const { SOLVE_TIMEOUT_MS, solveInWorker } = await loadClient()
    vi.useFakeTimers()
    const result = solveInWorker(input, TEST_META)
    vi.advanceTimersByTime(SOLVE_TIMEOUT_MS)
    await expect(result).rejects.toMatchObject({ reason: 'timeout' })
    expect(FakeWorker.made[0].terminated).toBe(true)
  })
})

describe('the watchdog', () => {
  it('outlasts every solver stage running to its own time limit', async () => {
    const { SOLVE_TIMEOUT_MS } = await loadClient()
    const { STAGES } = await import('../../src/core/model')
    const { STAGE_TIME_LIMIT } = await import('../../src/core/solve')
    expect(SOLVE_TIMEOUT_MS).toBeGreaterThan(STAGES.length * STAGE_TIME_LIMIT * 1000)
  })

  it('gives each stage room for a slow, busy laptop', async () => {
    const { STAGE_TIME_LIMIT } = await import('../../src/core/solve')
    expect(STAGE_TIME_LIMIT).toBeGreaterThanOrEqual(15)
  })
})
