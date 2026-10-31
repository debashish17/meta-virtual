import type { ZoneType } from '@office/shared'
import LookEditor from './LookEditor'
import { OVERVIEW, useOfficeUi } from './state'
import './office.css'

/** Room label pill at the top centre (DESIGN_SPEC 9), the look editor and a one-line control hint. */

const KIND: Record<ZoneType, string> = {
  meeting_room: 'Meeting room', customer_room: 'Customer room', project_room: 'Project room',
  kitchen: 'Kitchen', open_plan: 'Open plan',
}

export default function Hud() {
  const zone = useOfficeUi((s) => s.zone)
  if (OVERVIEW) return null
  return (
    <>
      <div className={zone ? 'office-pill on' : 'office-pill'} role="status" aria-live="polite">
        {zone && <><span>{KIND[zone.type]}</span>{zone.name}</>}
      </div>
      <LookEditor />
      <p className="office-hint">WASD or arrow keys to walk · Shift to jog · click the floor to walk there · click a desk chair to sit, the tea counter for a drink (or E nearby) · scroll to zoom</p>
    </>
  )
}
