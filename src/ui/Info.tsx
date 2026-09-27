/** A small ⓘ that explains something on hover (and to screen readers). */
export function Info({ text }: { text: string }) {
  return (
    <span className="info" title={text} aria-label={text} role="img">
      ⓘ
    </span>
  )
}
