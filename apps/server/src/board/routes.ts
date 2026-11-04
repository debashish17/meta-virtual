import type { Request, Response, Router } from "express";
import {
  BoardPin,
  BoardPinCreate,
  BoardPinList,
  OkResult,
  RecordId,
  type AuthClaims,
} from "@office/shared";
import { UnauthorizedError } from "../auth/verify.js";
import { NotFoundError } from "../db/repo.js";
import type { Deps } from "../deps.js";
import { BoardForbiddenError } from "./store.js";

/**
 * `GET /board`, `POST /board` and `DELETE /board/:id` (ARCHITECTURE.md 12.10,
 * P6-D). Mounted on the P6 router, so auth and the rate limiter already ran;
 * the workspace and the author always come from the token. Every write
 * broadcasts `records_changed board`, so the second browser and the cork board
 * refresh live. Only the author deletes (403); unknown pins read as missing.
 */

type AuthedRequest = Request & { claims: AuthClaims };

function claimsOf(req: Request): AuthClaims {
  return (req as AuthedRequest).claims;
}

function sendError(res: Response, error: unknown): void {
  if (error instanceof UnauthorizedError) {
    res.status(401).json({ error: "unauthorized", message: error.message });
    return;
  }
  if (error instanceof NotFoundError) {
    res.status(404).json({ error: "not_found", message: error.message });
    return;
  }
  if (error instanceof BoardForbiddenError) {
    res.status(403).json({ error: "forbidden", message: error.message });
    return;
  }
  console.error(
    `[board] request failed: ${error instanceof Error ? error.message : "unknown error"}`,
  );
  res.status(500).json({ error: "internal", message: "internal error" });
}

export function mountBoardRoutes(router: Router, deps: Deps): void {
  const store = deps.board;
  if (!store) {
    return;
  }

  router.get("/board", (req: Request, res: Response) => {
    void (async () => {
      try {
        res.json(BoardPinList.parse({ pins: await store.list(claimsOf(req)) }));
      } catch (error) {
        sendError(res, error);
      }
    })();
  });

  router.post("/board", (req: Request, res: Response) => {
    void (async () => {
      try {
        const parsed = BoardPinCreate.safeParse(req.body);
        if (!parsed.success) {
          res.status(400).json({ error: "bad_request", message: "bad pin" });
          return;
        }
        const claims = claimsOf(req);
        const pin = await store.create(claims, parsed.data);
        deps.bus.recordsChanged(claims.workspaceId, ["board"]);
        res.status(201).json(BoardPin.parse(pin));
      } catch (error) {
        sendError(res, error);
      }
    })();
  });

  router.delete("/board/:id", (req: Request, res: Response) => {
    void (async () => {
      try {
        const id = RecordId.safeParse(req.params["id"] ?? "");
        if (!id.success) {
          res.status(400).json({ error: "bad_request", message: "bad pin id" });
          return;
        }
        const claims = claimsOf(req);
        await store.remove(claims, id.data);
        deps.bus.recordsChanged(claims.workspaceId, ["board"]);
        res.json(OkResult.parse({ ok: true }));
      } catch (error) {
        sendError(res, error);
      }
    })();
  });
}
