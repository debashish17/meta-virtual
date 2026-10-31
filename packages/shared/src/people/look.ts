import { z } from "zod";
import bodies from "./bodies.generated.json";

/**
 * How an employee looks in the office: one of the Mixamo characters (apps/web/scripts/people/
 * bake.mjs) with their clothes in colours from fixed muted palettes that sit well against the grey
 * floor and oak furniture, at their own height. Face, skin and hair belong to the character.
 * Players will carry their look in M3, so it is validated here.
 */

export const BODY_IDS = ["casual", "suit", "suit_tie"] as const;   // a woman in a blouse; men in a blazer, and a suit and tie
export type BodyId = (typeof BODY_IDS)[number];

/** The moves (clip names in the moves GLB). */
export const MOVES = ["idle", "walk", "jog", "talk", "talk_2", "phone", "interact", "sit", "sit_talk", "type"] as const;
export type Move = (typeof MOVES)[number];

const Role = z.enum(["top", "accent", "bottom", "shoes", "fixed"]);

/** bodies.generated.json, written by the bake. */
export const BodyManifest = z.object({
  schemaVersion: z.literal(2),
  bodies: z.array(z.object({
    id: z.enum(BODY_IDS),
    height: z.number().positive(),            // metres, as baked
    url: z.string().startsWith("/assets/people/"),
    meshes: z.array(z.object({ name: z.string(), role: Role, tris: z.number().int().nonnegative() }).strict()),
    tris: z.number().int().positive(),
  }).strict()),
  moves: z.object({
    url: z.string().startsWith("/assets/people/"),
    clips: z.array(z.object({ name: z.string(), seconds: z.number().positive() }).strict()),
    metresPerSecond: z.record(z.string(), z.number().positive()),   // ground covered by walk / jog before they were pinned in place
  }).strict(),
}).strict();

export const BODIES = BodyManifest.parse(bodies);
export type Body = (typeof BODIES)["bodies"][number];
export const bodyOf = (id: BodyId): Body => BODIES.bodies.find((b) => b.id === id)!;

export const CLOTHING = [
  "#34495e", "#4f7393", "#3f7f7a", "#7d9a7a", "#c99a3d", "#b5654a", "#7d3a45", "#3a3d42", "#e8e1d3",
  "#f2f2ef", "#8a83a6", "#6b6b3c", "#a89a7a", "#4a5d78", "#24262a", "#7a7d82", "#6b4e3a",
] as const;
export const HEIGHT_RANGE = [1.55, 1.95] as const;

export const AvatarLook = z.object({
  body: z.enum(BODY_IDS),
  top: z.enum(CLOTHING),           // blouse or jacket
  accent: z.enum(CLOTHING),        // the shirt under a jacket, and the tie
  bottom: z.enum(CLOTHING),
  shoes: z.enum(CLOTHING),
  height: z.number().min(HEIGHT_RANGE[0]).max(HEIGHT_RANGE[1]),
}).strict();

export type AvatarLook = z.infer<typeof AvatarLook>;

const look = (l: AvatarLook) => AvatarLook.parse(l);

/** Northwind's team (PROJECT_BRIEF: Maya and Arjun; the rest are fictional colleagues for the demo). */
export const LOOK_PRESETS: readonly { id: string; name: string; role: string; look: AvatarLook }[] = [
  { id: "maya", name: "Maya", role: "Customer success lead", look: look({ body: "casual",
    top: "#f2f2ef", accent: "#f2f2ef", bottom: "#34495e", shoes: "#24262a", height: 1.68 }) },
  { id: "arjun", name: "Arjun", role: "Integration engineer", look: look({ body: "suit",
    top: "#3f7f7a", accent: "#e8e1d3", bottom: "#4a5d78", shoes: "#6b4e3a", height: 1.78 }) },
  { id: "lena", name: "Lena", role: "Product designer", look: look({ body: "casual",
    top: "#c99a3d", accent: "#e8e1d3", bottom: "#3a3d42", shoes: "#6b4e3a", height: 1.66 }) },
  { id: "omar", name: "Omar", role: "Platform engineer", look: look({ body: "suit",
    top: "#7a7d82", accent: "#24262a", bottom: "#a89a7a", shoes: "#24262a", height: 1.84 }) },
  { id: "priya", name: "Priya", role: "Product manager", look: look({ body: "casual",
    top: "#7d3a45", accent: "#f2f2ef", bottom: "#24262a", shoes: "#24262a", height: 1.62 }) },
  { id: "tom", name: "Tom", role: "Account manager", look: look({ body: "suit_tie",
    top: "#34495e", accent: "#f2f2ef", bottom: "#34495e", shoes: "#6b4e3a", height: 1.80 }) },
  { id: "grace", name: "Grace", role: "Support engineer", look: look({ body: "casual",
    top: "#7d9a7a", accent: "#e8e1d3", bottom: "#4a5d78", shoes: "#f2f2ef", height: 1.70 }) },
  { id: "kenji", name: "Kenji", role: "Data analyst", look: look({ body: "suit_tie",
    top: "#a89a7a", accent: "#f2f2ef", bottom: "#a89a7a", shoes: "#24262a", height: 1.74 }) },
  { id: "sofia", name: "Sofia", role: "Sales lead", look: look({ body: "casual",
    top: "#b5654a", accent: "#e8e1d3", bottom: "#34495e", shoes: "#7d3a45", height: 1.67 }) },
  { id: "ben", name: "Ben", role: "Office manager", look: look({ body: "suit",
    top: "#8a83a6", accent: "#f2f2ef", bottom: "#6b6b3c", shoes: "#3a3d42", height: 1.76 }) },
];

export const DEFAULT_LOOK: AvatarLook = LOOK_PRESETS[0].look;

/** A look derived from any string (a user id or name), for people who have not chosen one. */
export function lookFromSeed(seed: string): AvatarLook {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.codePointAt(0)!, 16777619);
  const pick = <T>(values: readonly T[]) => {
    h = Math.imul(h ^ (h >>> 15), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909);
    return values[(h >>> 0) % values.length];
  };
  const body = pick(BODY_IDS);
  const top = pick(CLOTHING);
  const base = body === "casual" ? 1.6 : 1.72;
  return {
    body,
    top,
    accent: pick(CLOTHING.filter((c) => c !== top)),
    bottom: pick(CLOTHING),
    shoes: pick(CLOTHING),
    height: Math.round((base + ((h >>> 0) % 1000) / 1000 * 0.18) * 100) / 100,
  };
}
