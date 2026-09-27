import { groupName, ui } from '../i18n/hu'

type Props = {
  groups: number
  labels?: string[]
  onChange: (group: number, label: string) => void
}

/** Optional group names ("1. cs. – Pillangó"), folded away by default. */
export function GroupLabels({ groups, labels, onChange }: Props) {
  return (
    <details className="labels">
      <summary>
        {groupName(1)}, {groupName(2)}… — nevek
      </summary>
      {Array.from({ length: groups }, (_, i) => (
        <label key={i}>
          {ui.roster.groupLabel(i + 1)}
          <input value={labels?.[i] ?? ''} onChange={(e) => onChange(i + 1, e.target.value)} />
        </label>
      ))}
    </details>
  )
}
