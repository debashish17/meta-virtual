import type { Router } from "express";
import type { Deps } from "../deps.js";

/**
 * P6-0 slot: mounts nothing yet. P6-R mounts `GET /receipts?accountId=&projectId=&limit=`
 * on this router (already behind auth and the rate limiter).
 */
export function mountReceiptRoutes(router: Router, deps: Deps): void {
  // P6-R fills this in.
  void router;
  void deps;
}
