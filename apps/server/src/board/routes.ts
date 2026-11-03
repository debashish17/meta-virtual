import type { Router } from "express";
import type { Deps } from "../deps.js";

/**
 * P6-0 slot: mounts nothing yet. P6-D mounts `GET /board`, `POST /board` and
 * `DELETE /board/:id` on this router (already behind auth and the rate limiter).
 */
export function mountBoardRoutes(router: Router, deps: Deps): void {
  // P6-D fills this in.
  void router;
  void deps;
}
