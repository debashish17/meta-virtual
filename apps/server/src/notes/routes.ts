import type { Request, Response, Router } from "express";
import {
  Note,
  NoteCreate,
  NoteList,
  NoteUpdate,
  OkResult,
  RecordId,
  type AuthClaims,
} from "@office/shared";
import { UnauthorizedError } from "../auth/verify.js";
import { NotFoundError } from "../db/repo.js";
import type { Deps } from "../deps.js";

/**
 * `GET /notes`, `POST /notes`, `PATCH /notes/:id` and `DELETE /notes/:id`
 * (ARCHITECTURE.md 12.10, P6-C). Mounted on the P6 router, so auth and the rate
 * limiter already ran; the workspace and the author always come from the token.
 * Notes are private: no `records_changed`, no invites.
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
  console.error(
    `[notes] request failed: ${error instanceof Error ? error.message : "unknown error"}`,
  );
  res.status(500).json({ error: "internal", message: "internal error" });
}

export function mountNoteRoutes(router: Router, deps: Deps): void {
  const store = deps.notes;
  if (!store) {
    return;
  }

  router.get("/notes", (req: Request, res: Response) => {
    void (async () => {
      try {
        res.json(NoteList.parse({ notes: await store.list(claimsOf(req)) }));
      } catch (error) {
        sendError(res, error);
      }
    })();
  });

  router.post("/notes", (req: Request, res: Response) => {
    void (async () => {
      try {
        const parsed = NoteCreate.safeParse(req.body);
        if (!parsed.success) {
          res.status(400).json({ error: "bad_request", message: "bad note" });
          return;
        }
        res.status(201).json(Note.parse(await store.create(claimsOf(req), parsed.data)));
      } catch (error) {
        sendError(res, error);
      }
    })();
  });

  router.patch("/notes/:id", (req: Request, res: Response) => {
    void (async () => {
      try {
        const id = RecordId.safeParse(req.params["id"] ?? "");
        if (!id.success) {
          res.status(400).json({ error: "bad_request", message: "bad note id" });
          return;
        }
        const parsed = NoteUpdate.safeParse(req.body);
        if (!parsed.success) {
          res.status(400).json({ error: "bad_request", message: "bad note" });
          return;
        }
        res.json(Note.parse(await store.update(claimsOf(req), id.data, parsed.data)));
      } catch (error) {
        sendError(res, error);
      }
    })();
  });

  router.delete("/notes/:id", (req: Request, res: Response) => {
    void (async () => {
      try {
        const id = RecordId.safeParse(req.params["id"] ?? "");
        if (!id.success) {
          res.status(400).json({ error: "bad_request", message: "bad note id" });
          return;
        }
        await store.remove(claimsOf(req), id.data);
        res.json(OkResult.parse({ ok: true }));
      } catch (error) {
        sendError(res, error);
      }
    })();
  });
}
