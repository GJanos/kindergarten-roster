import { ui } from '../i18n/hu'
import { isRostered, type Action, type AppState } from '../state/appState'
import { carryPatch, leaveBalance } from '../state/leave'
import { ROLES, type Role, type Staff } from '../core/types'
import { today } from './dates'
import { Info } from './Info'

type Props = { state: AppState; dispatch: (action: Action) => void }

/** Teachers and nannies, then the helpers (v3-c) on a row of their own below. */
const ROWS: readonly (readonly Role[])[] = [
  ['teacher', 'nanny'],
  ['assistant', 'civil'],
]

/** The staff by role, side by side where they fit; deleted people stay hidden. */
export function StaffScreen({ state, dispatch }: Props) {
  const visible = state.staff.filter((s) => !s.deleted)
  const uses = new Map<string, number>()
  for (const s of visible) {
    const name = s.displayName.trim()
    if (name) uses.set(name, (uses.get(name) ?? 0) + 1)
  }

  return (
    <section className="staff-screen">
      <details className="tips">
        <summary>{ui.staff.legendTitle}</summary>
        <ul>
          {ui.staff.legend.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </details>
      {visible.length === 0 && <p>{ui.staff.empty}</p>}
      {ROWS.map((roles) => (
        <div key={roles[0]} className="staff-columns">
          {roles.map((role) => (
            <StaffColumn
              key={role}
              role={role}
              // Inactive people sink to the bottom; the order is otherwise hers.
              people={visible
                .filter((s) => s.role === role)
                .sort((a, b) => Number(b.active) - Number(a.active))}
              isDuplicate={(s) => (uses.get(s.displayName.trim()) ?? 0) > 1}
              state={state}
              dispatch={dispatch}
            />
          ))}
        </div>
      ))}
    </section>
  )
}

type ColumnProps = Props & {
  role: Role
  people: Staff[]
  isDuplicate: (s: Staff) => boolean
}

function StaffColumn({ role, people, isDuplicate, state, dispatch }: ColumnProps) {
  const year = today().slice(0, 4)
  const title = ui.staff.sections[role]
  const headingId = `staff-${role}`
  const update = (id: string, patch: Partial<Omit<Staff, 'id'>>) =>
    dispatch({ type: 'updateStaff', id, patch })
  const remove = (s: Staff) => {
    const name = s.displayName || s.fullName
    const question = isRostered(state, s.id)
      ? ui.staff.confirmRemoveRostered(name)
      : ui.staff.confirmRemove(name)
    if (window.confirm(question)) dispatch({ type: 'deleteStaff', id: s.id })
  }

  return (
    <section className="staff-column" aria-labelledby={headingId}>
      <h3 id={headingId}>
        {title} ({people.length})
      </h3>
      {people.length > 0 && (
        <table className="staff">
          <thead>
            <tr>
              <th>{ui.staff.fullName}</th>
              <th>{ui.staff.displayName}</th>
              <th>
                {ui.staff.active} <Info text={ui.staff.activeHint} />
              </th>
              <th>
                {ui.staff.leaveAllowance} <Info text={ui.staff.leaveAllowanceHint} />
              </th>
              <th>
                {ui.staff.leaveCarry(year)} <Info text={ui.staff.leaveCarryHint} />
              </th>
              <th>{ui.staff.leaveLeft(year)}</th>
              <th>{ui.staff.role}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {people.map((s) => {
              const duplicate = isDuplicate(s)
              return (
                <tr key={s.id} className={s.active ? undefined : 'inactive'}>
                  <td>
                    <input
                      aria-label={ui.staff.fullName}
                      className="full-name"
                      value={s.fullName}
                      onChange={(e) => update(s.id, { fullName: e.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      aria-label={ui.staff.displayName}
                      className={duplicate ? 'display-name duplicate' : 'display-name'}
                      value={s.displayName}
                      onChange={(e) => update(s.id, { displayName: e.target.value })}
                    />
                    {duplicate && <div className="error name-warning">{ui.staff.duplicate}</div>}
                  </td>
                  <td className="center">
                    <input
                      type="checkbox"
                      aria-label={ui.staff.active}
                      checked={s.active}
                      onChange={(e) => update(s.id, { active: e.target.checked })}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      min={0}
                      className="allowance"
                      aria-label={ui.staff.leaveAllowance}
                      value={s.leaveAllowance ?? ''}
                      onChange={(e) =>
                        update(s.id, {
                          leaveAllowance:
                            e.target.value === ''
                              ? undefined
                              : Math.max(0, Math.round(Number(e.target.value))),
                        })
                      }
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      min={0}
                      className="allowance"
                      aria-label={ui.absences.carry(year)}
                      value={s.leaveCarry?.[year] ?? 0}
                      onChange={(e) => update(s.id, carryPatch(s, year, e.target.value))}
                    />
                  </td>
                  <td className="leave-left">
                    {s.leaveAllowance !== undefined &&
                      ui.absences.balance(leaveBalance(state.absences, s, year).remaining)}
                  </td>
                  <td>
                    <select
                      aria-label={ui.staff.role}
                      title={ui.staff.roleHint}
                      value={s.role}
                      onChange={(e) => update(s.id, { role: e.target.value as Role })}
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {ui.staff.roles[r]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <button className="small" title={ui.staff.removeHint} onClick={() => remove(s)}>
                      {ui.staff.remove}
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
      <button
        className="primary"
        onClick={() => dispatch({ type: 'addStaff', id: crypto.randomUUID(), role })}
      >
        {ui.staff.add[role]}
      </button>
    </section>
  )
}
