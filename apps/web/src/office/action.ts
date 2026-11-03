import type { Activity, Point, Target } from '@office/shared'

/**
 * What E does right now, shown as a chip under your feet that you can also click (Avatar.tsx):
 * sit down at the free chair or get a drink at the counter within reach (marked with a ring on
 * the floor), call off the walk there, stand up once seated, step away from the counter, or,
 * while a move plays, what is happening. Clicking a chair still works as before.
 */
export type Action =
  | { kind: 'sit' | 'drink'; at: Point }
  | { kind: 'cancel' }
  | { kind: 'stand' }
  | { kind: 'step_away' }
  | { kind: 'busy'; label: 'Sitting down' | 'Standing up' }

/** Where you are in using a chair or the counter. */
export type Phase = 'free' | 'going' | 'sitting_down' | 'seated' | 'standing_up' | 'at_counter'

export function actionFor({ phase, near }: { phase: Phase; near: Target | null }): Action | null {
  switch (phase) {
    case 'free':
      if (!near) return null
      return near.kind === 'seat'
        ? { kind: 'sit', at: { x: near.seat.x, z: near.seat.z } }
        : { kind: 'drink', at: { x: near.spot.x, z: near.spot.z } }
    case 'going': return { kind: 'cancel' }
    case 'sitting_down': return { kind: 'busy', label: 'Sitting down' }
    case 'seated': return { kind: 'stand' }
    case 'standing_up': return { kind: 'busy', label: 'Standing up' }
    case 'at_counter': return { kind: 'step_away' }
  }
}

const LABEL = { sit: 'Sit down', drink: 'Get a drink', cancel: 'Cancel', stand: 'Stand up', step_away: 'Step away' } as const

/** The chip\'s text, and the key that does it (none while a move is under way). */
export function describeAction(a: Action): { key: 'E' | null; label: string } {
  return a.kind === 'busy' ? { key: null, label: `${a.label}…` } : { key: 'E', label: LABEL[a.kind] }
}

/** Offline: from your activity, and whether you are walking to a chair or the counter. */
export function phaseOffline(activity: Activity, pending: boolean): Phase {
  switch (activity.kind) {
    case 'free': return pending ? 'going' : 'free'
    case 'entering':
    case 'sitting_down': return 'sitting_down'
    case 'swivelling': return activity.to === 'desk' ? 'sitting_down' : 'standing_up'
    case 'seated': return 'seated'
    case 'standing_up':
    case 'leaving': return 'standing_up'
    case 'using': return 'at_counter'
  }
}

/** Online: from the avatar\'s mode, the synced activity kind and pose. */
export function phaseOnline(mode: 'free' | 'approach' | 'activity' | 'leaving', activity: 'seat' | 'counter' | null, pose: string): Phase {
  if (mode === 'free') return 'free'
  if (mode === 'approach') return 'going'
  if (mode === 'leaving') return 'standing_up'
  if (activity === 'counter') return 'at_counter'
  return pose === 'type' || pose === 'sit_talk' ? 'seated' : 'sitting_down'
}

/** Two actions show the same chip (and ring). */
export const sameAction = (a: Action | null, b: Action | null): boolean => JSON.stringify(a) === JSON.stringify(b)
