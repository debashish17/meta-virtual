import type { Request, Response, Router } from "express";
import { ReceiptList, ReceiptQuery, type AuthClaims } from "@office/shared";
import type { Deps } from "../deps.js";

/**
 * `GET /receipts?accountId=&projectId=&limit=` (ARCHITECTURE.md 12.10, P6-R): one decided
 * change each, newest first, composed from the existing `Repo` reads. Mounted on the P6
 * router, so auth and the rate limiter already ran; the workspace comes from the token.
 */

function claimsOf(req: Request): AuthClaims {
  return (req as Request & { claims: AuthClaims }).claims;
}

function firstQuery(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value) && typeof value[0] === "string") {
    return value[0];
  }
  return undefined;
}

export function mountReceiptRoutes(router: Router, deps: Deps): void {
  const store = deps.receipts;
  if (!store) {
    return;
  }
  router.get("/receipts", (req: Request, res: Response) => {
    void (async () => {
      try {
        const rawLimit = firstQuery(req.query["limit"]);
        const parsed = ReceiptQuery.safeParse({
          accountId: firstQuery(req.query["accountId"]),
          projectId: firstQuery(req.query["projectId"]),
          limit: rawLimit === undefined ? undefined : Number(rawLimit),
        });
        if (!parsed.success) {
          res.status(400).json({ error: "bad_request", message: "bad receipts query" });
          return;
        }
        res.json(
          ReceiptList.parse({ receipts: await store.list(claimsOf(req), parsed.data) }),
        );
      } catch (error) {
        console.error(
          `[receipts] GET /receipts failed: ${error instanceof Error ? error.message : "unknown error"}`,
        );
        res.status(500).json({ error: "internal", message: "internal error" });
      }
    })();
  });
}
