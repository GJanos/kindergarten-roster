import type { ReactNode } from 'react'

/**
 * What comes and goes after a click (a pick, a question, the undo bar) gathers here, at the end
 * of the page and sticky to the bottom of the screen. Anything it adds or drops lands below the
 * page, so nothing above it ever moves, and scrolled to the end it rests above the footer.
 */
export function ActionDock({ children }: { children: ReactNode }) {
  return (
    <div className="action-dock screen-only" aria-live="polite">
      {children}
    </div>
  )
}
