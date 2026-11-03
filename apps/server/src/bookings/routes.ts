import type { Router } from "express";
import type { Deps } from "../deps.js";

/**
 * P6-0 slot: mounts nothing yet. P6-B mounts `POST /bookings`, `GET /bookings?status=open`
 * and `POST /bookings/:id/end` on this router (already behind auth and the rate limiter).
 */
export function mountBookingRoutes(router: Router, deps: Deps): void {
  // P6-B fills this in.
  void router;
  void deps;
}
