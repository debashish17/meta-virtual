import { BODIES, bodyOf, type AvatarLook, type Move } from '@office/shared'

/** Seconds a baked move lasts (bodies.generated.json). */
export const secondsOf = (move: Move) => BODIES.moves.clips.find((c) => c.name === move)?.seconds ?? 1

/** Metres from the seat to where someone stands to sit down (and is after getting up): the step in
 * the sitting-down and standing-up moves, at their height. */
export const riseOf = (look: AvatarLook) => (BODIES.moves.standToSeat * look.height) / bodyOf(look.body).height
