import { useEffect, useState } from 'react'
import { ui } from '../i18n/hu'

type Theme = 'light' | 'dark'
const KEY = 'theme'

function stored(): Theme | undefined {
  try {
    const value = localStorage.getItem(KEY)
    return value === 'light' || value === 'dark' ? value : undefined
  } catch {
    return undefined // storage blocked: follow the system
  }
}

function system(): Theme {
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'
}

/** Light or dark; follows the system until she picks one, then remembers it. */
export function ThemeToggle() {
  const [choice, setChoice] = useState<Theme | undefined>(stored)
  const theme = choice ?? system()
  const next: Theme = theme === 'dark' ? 'light' : 'dark'

  useEffect(() => {
    if (!choice) return
    document.documentElement.dataset.theme = choice
    try {
      localStorage.setItem(KEY, choice)
    } catch {
      // Not remembered, but still applied for this visit.
    }
  }, [choice])

  return (
    <button
      className="theme-toggle small"
      aria-label={ui.theme[next]}
      title={ui.theme[next]}
      onClick={() => setChoice(next)}
    >
      {next === 'dark' ? '☾' : '☀'}
    </button>
  )
}
