import highsLoader from 'highs'
import wasmUrl from 'highs/runtime?url'
import { makeRoster } from '../core/pipeline'
import type { SolveRequest, SolveResponse } from './protocol'

// Loaded once per worker; the service worker caches the .wasm for offline use.
const highs = highsLoader({ locateFile: () => wasmUrl })

const post = (message: SolveResponse) =>
  (self as unknown as { postMessage(message: SolveResponse): void }).postMessage(message)

self.onmessage = async (event: MessageEvent<SolveRequest>) => {
  const { id, input, meta, anchor } = event.data
  try {
    const result = makeRoster(input, await highs, meta, anchor)
    post(
      result.ok
        ? { id, ok: true, roster: result.roster }
        : { id, ok: false, reason: 'invalid', detail: JSON.stringify(result.violations) },
    )
  } catch (error) {
    post({ id, ok: false, reason: 'crash', detail: String(error) })
  }
}
