import { z } from "zod";

/**
 * What a person is doing, as the office draws it (Person.tsx): standing and moving about, talking
 * on foot or on the phone, using the counter, or the stages of sitting at a desk. Sitting down and
 * standing up play with the person placed on the seat, facing away from it to the side: the moves
 * carry the body between the seat and the spot beside it, so those changes cut instead of blending.
 */
export const PoseSchema = z.enum([
  "stand",
  "walk",
  "jog",
  "talk",
  "phone",
  "interact",
  "sit_down",
  "seated",
  "stand_up",
  "sit_talk",
  "type",
]);
export type Pose = z.infer<typeof PoseSchema>;
