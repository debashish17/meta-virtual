import { z } from "zod";
import { ItemId } from "./schema.js";

/**
 * Contract for builds.generated.json, written by `python blender-asset-pipeline/run.py build`:
 * one entry per built catalogue part (GLB, fixed-scale render, measured size, QA, review).
 */

const metres = z.object({ w: z.number().positive(), d: z.number().positive(), h: z.number().positive() }).strict();

export const QaVerdict = z.enum(["pass", "fail", "unchecked"]);
export const ReviewStatus = z.enum(["pending", "approved", "rejected", "stale"]);

export const QaCheck = z.object({
  name: z.string().min(1),
  status: QaVerdict,
  detail: z.string(),
}).strict();

/** The verdict implied by a list of checks: any fail fails, else any unchecked is unchecked. */
export function verdictOf(checks: { status: z.infer<typeof QaVerdict> }[]): z.infer<typeof QaVerdict> {
  if (checks.some((c) => c.status === "fail")) return "fail";
  if (checks.some((c) => c.status === "unchecked")) return "unchecked";
  return "pass";
}

export const BuildItem = z.object({
  id: ItemId,
  family: z.string().min(1),
  model: z.string().startsWith("/assets/models/catalogue/").endsWith(".glb"),
  thumb: z.object({
    url: z.string().startsWith("/assets/catalogue/thumbs/"),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
  }).strict(),
  targetM: metres,
  measuredM: metres,
  tris: z.number().int().nonnegative(),
  bytes: z.number().int().positive(),
  qa: QaVerdict,
  checks: z.array(QaCheck).min(1),
  review: ReviewStatus,
  reviewNote: z.string(),
  specHash: z.string().length(16),
  buildHash: z.string().length(16),   // geometry hash of the GLB; a decision goes stale when it changes
}).strict().refine((b) => b.qa === verdictOf(b.checks), {
  message: "qa verdict must follow its checks: fail > unchecked > pass",
});

export const Builds = z.object({
  schemaVersion: z.literal(1),
  pxPerM: z.number().positive(),
  items: z.array(BuildItem),
  failures: z.array(z.object({ id: z.string(), error: z.string() }).strict()),
}).strict();

export type QaVerdict = z.infer<typeof QaVerdict>;
export type ReviewStatus = z.infer<typeof ReviewStatus>;
export type BuildItem = z.infer<typeof BuildItem>;
export type Builds = z.infer<typeof Builds>;
