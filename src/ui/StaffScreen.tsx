import { ui } from '../i18n/hu'
import { isRostered, type Action, type AppState } from '../state/appState'
import type { Staff } from '../core/types'

type Props = { state: AppState; dispatch: (action: Action) => void }

export function StaffScreen({ state, dispatch }: Props) {
  const update = (id: string, patch: Partial<Omit<Staff, 'id'>>) =>
    dispatch({ type: 'updateStaff', id, patch })
  const uses = new Map<string, number>()
  for (const s of state.staff) {
    const name = s.displayName.trim()
    if (name) uses.set(name, (uses.get(name) ?? 0) + 1)
  }

  return (
    <section className="staff-screen">
      {state.staff.length === 0 && <p>{ui.staff.empty}</p>}
      {state.staff.length > 0 && (
        <table className="staff">
          <thead>
            <tr>
              <th>{ui.staff.fullName}</th>
              <th>{ui.staff.displayName}</th>
              <th>{ui.staff.role}</th>
              <th>{ui.staff.active}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {state.staff.map((s) => {
              const duplicate = (uses.get(s.displayName.trim()) ?? 0) > 1
              return (
                <tr key={s.id} className={s.active ? undefined : 'inactive'}>
                  <td>
                    <input
                      aria-label={ui.staff.fullName}
                      value={s.fullName}
                      onChange={(e) => update(s.id, { fullName: e.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      aria-label={ui.staff.displayName}
                      className={duplicate ? 'duplicate' : undefined}
                      value={s.displayName}
                      onChange={(e) => update(s.id, { displayName: e.target.value })}
                    />
                    {duplicate && <div className="error">{ui.staff.duplicate}</div>}
                  </td>
                  <td>
                    <div className="toggle">
                      {(['teacher', 'nanny'] as const).map((role) => (
                        <button
                          key={role}
                          className={s.role === role ? 'on' : undefined}
                          aria-pressed={s.role === role}
                          onClick={() => update(s.id, { role })}
                        >
                          {ui.staff[role]}
                        </button>
                      ))}
                    </div>
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      aria-label={ui.staff.active}
                      checked={s.active}
                      onChange={(e) => update(s.id, { active: e.target.checked })}
                    />
                  </td>
                  <td>
                    {!isRostered(state, s.id) && (
                      <button
                        onClick={() => {
                          if (window.confirm(ui.staff.confirmRemove(s.displayName || s.fullName))) {
                            dispatch({ type: 'deleteStaff', id: s.id })
                          }
                        }}
                      >
                        {ui.staff.remove}
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
      <button
        className="primary"
        onClick={() => dispatch({ type: 'addStaff', id: crypto.randomUUID() })}
      >
        {ui.staff.add}
      </button>
    </section>
  )
}
