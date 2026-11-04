import { create } from 'zustand'

/**
 * The loading screen's lifecycle (owner, 2026-11-04: no blank screen while the office loads).
 * `shown`: the floor has rendered (ReadySignal, a few frames after every asset resolved), so the
 * screen fades out. `gone`: the fade is over and the screen unmounted; only then does the scene
 * report `__officeReady`, so screenshots and tests never catch the fade.
 */
export const useLoading = create<{ shown: boolean; gone: boolean }>(() => ({ shown: false, gone: false }))

/** How long the screen fades before it unmounts (matches `.office-loading` in office.css). */
export const LOADING_FADE_MS = 280

/** The step line and the percentage for the loading screen. `peak`: the highest share seen (0-100). */
export function loadingCopy(peak: number, total: number, shown: boolean): { step: string; pct: number } {
  if (shown) return { step: 'Welcome in', pct: 100 }
  if (total === 0) return { step: 'Opening the office', pct: 0 }
  if (peak < 100) return { step: 'Bringing in the furniture and the team', pct: Math.max(0, Math.min(99, Math.floor(peak))) }
  return { step: 'Setting up the floor', pct: 100 }
}
