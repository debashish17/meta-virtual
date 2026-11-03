import { describeAction } from './action'
import { useOfficeUi } from './state'

/**
 * The chip under your feet saying what E does now (action.ts): a button you can also click, or,
 * while a move plays, what is happening. Rendered in the scene (drei Html), like the name pill.
 */
export default function ActionChip({ onAct }: { onAct: () => void }) {
  const action = useOfficeUi((s) => s.action)
  if (!action) return null
  const { key, label } = describeAction(action)
  if (!key) return <div className="office-action busy" role="status">{label}</div>
  return (
    <button type="button" className="office-action" onClick={onAct} onPointerDown={(e) => e.stopPropagation()}>
      <kbd>{key}</kbd>
      {label}
    </button>
  )
}
