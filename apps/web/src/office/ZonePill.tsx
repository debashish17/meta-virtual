import type { ZoneType } from '@office/shared'
import { useOfficeUi } from './state'

const KIND: Record<ZoneType, string> = {
  meeting_room: 'Meeting room', customer_room: 'Customer room', project_room: 'Project room',
  kitchen: 'Kitchen', open_plan: 'Open plan',
}

/** The room label (DESIGN_SPEC 9): the first segment of the top strip, empty between rooms. */
export default function ZonePill() {
  const zone = useOfficeUi((s) => s.zone)
  return (
    <div className={zone ? 'office-pill on' : 'office-pill'} role="status" aria-live="polite">
      {zone && <><span>{KIND[zone.type]}</span>{zone.name}</>}
    </div>
  )
}
