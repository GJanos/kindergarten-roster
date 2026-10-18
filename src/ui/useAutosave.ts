import { useCallback, useEffect, useRef, useState } from 'react'
import type { Action, AppState } from '../state/appState'
import {
  DEFAULT_MINUTES,
  autosaveSupported,
  canWrite,
  clearAutosave,
  contentOf,
  loadAutosave,
  pickFolder,
  saveAutosave,
  writeBackupFile,
  type AutosaveConfig,
  type DirectoryHandle,
} from '../state/autosave'
import { today } from './dates'

/**
 * - `paused`: the browser wants her to allow the folder again (after a restart). Shown loudly, so
 *   autosave never stops in silence.
 * - `failed`: the last write failed (a full disk, a removed stick).
 * - `demo`: the demo never autosaves; it would overwrite her real file of the day.
 */
export type AutosaveStatus = 'unsupported' | 'demo' | 'loading' | 'off' | 'paused' | 'on' | 'failed'

export type Autosave = {
  status: AutosaveStatus
  minutes: number
  folder?: string
  fileName?: string // the last file written this session
  savedAt?: string // ISO time of that write
  enable: () => Promise<void>
  disable: () => Promise<void>
  allow: () => Promise<void>
  retry: () => Promise<void>
  setMinutes: (minutes: number) => Promise<void>
}

/** The browser's parts, swappable in tests. */
export type AutosaveDeps = {
  supported: () => boolean
  pick: () => Promise<DirectoryHandle>
  load: () => Promise<AutosaveConfig | undefined>
  save: (config: AutosaveConfig) => Promise<void>
  clear: () => Promise<void>
}

const BROWSER: AutosaveDeps = {
  supported: autosaveSupported,
  pick: pickFolder,
  load: loadAutosave,
  save: saveAutosave,
  clear: clearAutosave,
}

type Phase = Exclude<AutosaveStatus, 'unsupported' | 'demo'>

/**
 * Writes the day's backup file to her folder every few minutes while something changed, and when
 * the tab is hidden or closed (2026-10-18). Each write counts as a backup (`markBackedUp`).
 */
export function useAutosave(
  state: AppState,
  dispatch: (action: Action) => void,
  deps: AutosaveDeps = BROWSER,
  now: () => Date = () => new Date(),
): Autosave {
  const supported = deps.supported()
  const [phase, setPhase] = useState<Phase>('loading')
  const [config, setConfig] = useState<AutosaveConfig>()
  const [fileName, setFileName] = useState<string>()
  const [savedAt, setSavedAt] = useState<string>()
  const latest = useRef(state)
  const saved = useRef<string>(undefined) // what the last write held; none yet this session
  const busy = useRef(false)

  useEffect(() => {
    latest.current = state
  }, [state])

  useEffect(() => {
    if (!supported) return
    let live = true
    void (async () => {
      const stored = await deps.load().catch(() => undefined)
      if (!live) return
      if (!stored) return setPhase('off')
      setConfig(stored)
      const allowed = await canWrite(stored.dir, false).catch(() => false)
      if (live) setPhase(allowed ? 'on' : 'paused')
    })()
    return () => {
      live = false
    }
  }, [supported, deps])

  const write = useCallback(
    async (dir: DirectoryHandle) => {
      const current = latest.current
      if (current.demo || busy.current) return
      busy.current = true
      try {
        const name = await writeBackupFile(dir, current, today(now()))
        saved.current = contentOf(current)
        const at = now().toISOString()
        setFileName(name)
        setSavedAt(at)
        setPhase('on')
        dispatch({ type: 'markBackedUp', at })
      } catch {
        const allowed = await canWrite(dir, false).catch(() => false)
        setPhase(allowed ? 'failed' : 'paused')
      } finally {
        busy.current = false
      }
    },
    [dispatch, now],
  )

  const demo = state.demo === true
  useEffect(() => {
    if (phase !== 'on' || !config || demo) return
    const dir = config.dir
    const ifChanged = () => {
      if (contentOf(latest.current) !== saved.current) void write(dir)
    }
    const onHide = () => {
      if (document.visibilityState === 'hidden') ifChanged()
    }
    const timer = setInterval(ifChanged, config.minutes * 60_000)
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', ifChanged)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', ifChanged)
    }
  }, [phase, config, demo, write])

  // Each of these runs from her click, which the folder picker and the permission prompt need.
  const enable = async () => {
    let dir: DirectoryHandle
    try {
      dir = await deps.pick()
    } catch {
      return // she cancelled: it stays off
    }
    if (!(await canWrite(dir, true).catch(() => false))) return
    const next = { dir, minutes: config?.minutes ?? DEFAULT_MINUTES }
    await deps.save(next)
    setConfig(next)
    setPhase('on')
    await write(dir)
  }
  const allow = async () => {
    if (!config || !(await canWrite(config.dir, true).catch(() => false))) return
    setPhase('on')
    await write(config.dir)
  }
  const retry = async () => {
    if (config) await write(config.dir)
  }
  const disable = async () => {
    await deps.clear()
    setConfig(undefined)
    setFileName(undefined)
    setSavedAt(undefined)
    setPhase('off')
  }
  const setMinutes = async (minutes: number) => {
    if (!config) return
    const next = { ...config, minutes }
    await deps.save(next)
    setConfig(next)
  }

  return {
    status: !supported ? 'unsupported' : demo ? 'demo' : phase,
    minutes: config?.minutes ?? DEFAULT_MINUTES,
    folder: config?.dir.name,
    fileName,
    savedAt,
    enable,
    disable,
    allow,
    retry,
    setMinutes,
  }
}
