import type { Router } from "express";
import type { Deps } from "../deps.js";

/**
 * P6-0 slot: mounts nothing yet. P6-C mounts `GET /notes`, `POST /notes`,
 * `PATCH /notes/:id` and `DELETE /notes/:id` on this router (already behind auth and the
 * rate limiter).
 */
export function mountNoteRoutes(router: Router, deps: Deps): void {
  // P6-C fills this in.
  void router;
  void deps;
}
