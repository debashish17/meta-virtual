import type { Request, Response, Router } from "express";
import {
  Booking,
  BookingCreate,
  BookingList,
  OkResult,
  RecordId,
  type AuthClaims,
} from "@office/shared";
import { UnauthorizedError } from "../auth/verify.js";
import { NotFoundError, type Repo } from "../db/repo.js";
import type { Deps } from "../deps.js";
import {
  BookingForbiddenError,
  BookingValidationError,
  RoomBusyError,
} from "./store.js";

/**
 * `POST /bookings`, `GET /bookings?status=open` and `POST /bookings/:id/end`
 * (ARCHITECTURE.md 12.10, P6-B). Mounted on the P6 router, so auth and the rate
 * limiter already ran; the workspace always comes from the token.
 *
 * After a create the API sends `meeting_invite` to each connected invitee
 * (through `bus.meetingInvite`) and `records_changed bookings` to everyone; an
 * end broadcasts `records_changed bookings` so the room frees up live.
 */

type AuthedRequest = Request & { claims: AuthClaims };

function claimsOf(req: Request): AuthClaims {
  return (req as AuthedRequest).claims;
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

function sendError(res: Response, error: unknown): void {
  if (error instanceof UnauthorizedError) {
    res.status(401).json({ error: "unauthorized", message: error.message });
    return;
  }
  if (error instanceof BookingValidationError) {
    res.status(400).json({ error: "bad_request", message: error.message });
    return;
  }
  if (error instanceof NotFoundError) {
    res.status(404).json({ error: "not_found", message: error.message });
    return;
  }
  if (error instanceof BookingForbiddenError) {
    res.status(403).json({ error: "forbidden", message: error.message });
    return;
  }
  if (error instanceof RoomBusyError) {
    res.status(409).json({ error: "room_busy", message: error.message });
    return;
  }
  console.error(
    `[bookings] request failed: ${error instanceof Error ? error.message : "unknown error"}`,
  );
  res.status(500).json({ error: "internal", message: "internal error" });
}

/**
 * Every invitee must belong to the workspace. `dev:<name>` user ids resolve to
 * their demo key (`dev-arjun` to `arjun`), the way `DevAuth` mints them when no
 * database maps names to profile ids.
 */
async function checkInvitees(repo: Repo, claims: AuthClaims, inviteeIds: string[]): Promise<void> {
  const ids = new Set((await repo.people(claims)).map((person) => person.id));
  ids.add(claims.userId);
  const outside = inviteeIds.find((id) => !ids.has(id) && !(id.startsWith("dev-") && ids.has(id.slice(4))));
  if (outside !== undefined) {
    throw new BookingValidationError(`invitee ${outside} is outside this workspace`);
  }
}

export function mountBookingRoutes(router: Router, deps: Deps): void {
  const store = deps.bookings;
  if (!store) {
    return;
  }

  router.post("/bookings", (req: Request, res: Response) => {
    void (async () => {
      try {
        const parsed = BookingCreate.safeParse(req.body);
        if (!parsed.success) {
          res.status(400).json({ error: "bad_request", message: "bad booking" });
          return;
        }
        const claims = claimsOf(req);
        await checkInvitees(deps.repo, claims, parsed.data.inviteeIds);
        const booking = await store.create(claims, parsed.data);
        deps.bus.meetingInvite(claims.workspaceId, booking.inviteeIds, {
          bookingId: booking.id,
          zoneId: booking.zoneId,
          title: booking.title,
          hostName: claims.name,
        });
        deps.bus.recordsChanged(claims.workspaceId, ["bookings"]);
        res.status(201).json(Booking.parse(booking));
      } catch (error) {
        sendError(res, error);
      }
    })();
  });

  router.get("/bookings", (req: Request, res: Response) => {
    void (async () => {
      try {
        const status = firstQuery(req.query["status"]);
        if (status !== undefined && status !== "open") {
          res.status(400).json({ error: "bad_request", message: "only ?status=open is listed" });
          return;
        }
        res.json(
          BookingList.parse({ bookings: await store.listOpen(claimsOf(req)) }),
        );
      } catch (error) {
        sendError(res, error);
      }
    })();
  });

  router.post("/bookings/:id/end", (req: Request, res: Response) => {
    void (async () => {
      try {
        const parsed = RecordId.safeParse(req.params["id"] ?? "");
        if (!parsed.success) {
          res.status(400).json({ error: "bad_request", message: "bad booking id" });
          return;
        }
        const claims = claimsOf(req);
        await store.end(claims, parsed.data);
        deps.bus.recordsChanged(claims.workspaceId, ["bookings"]);
        res.json(OkResult.parse({ ok: true }));
      } catch (error) {
        sendError(res, error);
      }
    })();
  });
}
