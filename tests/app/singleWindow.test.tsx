// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react'
import { StrictMode } from 'react'
import { describe, expect, it } from 'vitest'
import { useSingleWindow } from '../../src/app/singleWindow'
import { FakeLocks, asLocks } from './fakeLocks'

describe('useSingleWindow', () => {
  it('lets the first window edit', async () => {
    const locks = asLocks(new FakeLocks())
    const { result } = renderHook(() => useSingleWindow(locks), { wrapper: StrictMode })
    await waitFor(() => expect(result.current.status).toBe('active'))
  })

  it('stops a second window, which can take over', async () => {
    const locks = asLocks(new FakeLocks())
    const first = renderHook(() => useSingleWindow(locks))
    await waitFor(() => expect(first.result.current.status).toBe('active'))
    const second = renderHook(() => useSingleWindow(locks))
    await waitFor(() => expect(second.result.current.status).toBe('elsewhere'))

    act(() => second.result.current.takeOver())
    await waitFor(() => expect(second.result.current.status).toBe('active'))
    await waitFor(() => expect(first.result.current.status).toBe('elsewhere'))
  })

  it('carries on alone where the browser has no locks', () => {
    const { result } = renderHook(() => useSingleWindow(undefined))
    expect(result.current.status).toBe('active')
  })
})
