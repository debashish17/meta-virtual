import { create } from 'zustand'
import { WORLD, type Zone } from '@office/shared'

/** Where the local avatar is, updated every frame by Avatar and read by the camera, the sun's
 * shadow frustum and wall fading. A plain object, so moving does not
 * re-render React. */
export const avatar = {
  x: WORLD.spawn.x,
  z: WORLD.spawn.z,
  facing: Math.PI * 0.75,   // radians about +y; starts looking into the office (north-east)
  pose: 'stand' as string,  // as drawn; in a chair it is in nobody's way (sim/apart.ts inTheWay)
}

/** The camera's look-at point, which eases after the avatar. */
export const view = { x: WORLD.spawn.x, z: WORLD.spawn.z, zoom: 62 }

type OfficeUi = {
  zone: Zone | null
  setZone: (zone: Zone | null) => void
}

export const useOfficeUi = create<OfficeUi>((set) => ({
  zone: null,
  setZone: (zone) => set({ zone }),
}))

/** `?view=overview` frames the whole floor with no avatar (used for review screenshots). */
export const OVERVIEW = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('view') === 'overview'
