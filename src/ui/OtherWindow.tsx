import { ui } from '../i18n/hu'

/** Shown instead of the app while another window has it open. */
export function OtherWindow({ onTakeOver }: { onTakeOver: () => void }) {
  return (
    <div className="first-launch">
      <h2>{ui.otherWindow.title}</h2>
      <p>{ui.otherWindow.body}</p>
      <button className="primary big" onClick={onTakeOver}>
        {ui.otherWindow.takeOver}
      </button>
    </div>
  )
}
