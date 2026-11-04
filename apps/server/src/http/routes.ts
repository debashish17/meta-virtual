import { Router, type Application, type NextFunction, type Request, type Response } from "express";
import {
  AccountStatus,
  AskRequest,
  AskResult,
  CallTokenRequest,
  FIXTURE_TRANSCRIPTS,
  Meeting,
  MeetingCreate,
  MeetingProcessResult,
  MyDay,
  OkResult,
  ProjectStatus,
  ProposedChangeList,
  ProposedChangeQuery,
  RecordId,
  ROOM_RECORDS,
  type AuthClaims,
  type ChangeType,
  type ProposedChange,
  type RecordKind,
} from "@office/shared";
import { askQuestion } from "../ask/pipeline.js";
import { UnauthorizedError } from "../auth/verify.js";
import {
  CallForbiddenError,
  CallsOffError,
  callsEnabled,
  issueCallToken,
} from "../calls/tokens.js";
import type { Deps } from "../deps.js";
import { mountBoardRoutes } from "../board/routes.js";
import { mountBookingRoutes } from "../bookings/routes.js";
import { mountNoteRoutes } from "../notes/routes.js";
import { mountReceiptRoutes } from "../receipts/routes.js";
import { NotFoundError, NotPendingError, type Repo } from "../db/repo.js";
import type { MeetingContext } from "../llm/types.js";
import { processMeeting } from "../meetings/pipeline.js";
import type { RecordsSnapshot } from "../meetings/map.js";
import { accountStatus } from "../status/accountStatus.js";
import { myDay } from "../status/myDay.js";
import { projectStatus } from "../status/projectStatus.js";
import { UserRateLimiter } from "./rateLimit.js";

export interface Health {
  ok: true;
  version: string;
  authMode: string;
  llm: string;
  calls: "on" | "off";
}

export interface HttpRoutesOptions {
  /** Per-user limiter; tests inject a small one, production uses the default. */
  limiter?: UserRateLimiter;
}

/** A 400: the body, params or query failed their shared Zod schema. */
export class BadRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BadRequestError";
  }
}

type AuthedRequest = Request & { claims: AuthClaims };

function bearer(req: Request): string | undefined {
  const header = req.header("authorization");
  if (!header) {
    return undefined;
  }
  const [scheme, token] = header.split(" ", 2);
  if (scheme?.toLowerCase() !== "bearer" || !token) {
    return undefined;
  }
  return token;
}

function claimsOf(req: Request): AuthClaims {
  return (req as AuthedRequest).claims;
}

function sendError(res: Response, error: unknown): void {
  if (error instanceof UnauthorizedError) {
    res.status(401).json({ error: "unauthorized", message: error.message });
    return;
  }
  if (error instanceof BadRequestError) {
    res.status(400).json({ error: "bad_request", message: error.message });
    return;
  }
  if (error instanceof NotFoundError) {
    res.status(404).json({ error: "not_found", message: error.message });
    return;
  }
  if (error instanceof NotPendingError) {
    res.status(409).json({ error: "conflict", message: error.message });
    return;
  }
  if (error instanceof CallsOffError) {
    res.status(503).json({ error: "calls_off", message: error.message });
    return;
  }
  if (error instanceof CallForbiddenError) {
    res.status(403).json({ error: "forbidden", message: error.message });
    return;
  }
  res.status(500).json({ error: "internal", message: "internal error" });
}

async function handle(req: Request, res: Response, run: () => Promise<unknown>): Promise<void> {
  try {
    res.json(await run());
  } catch (error) {
    if (!(error instanceof UnauthorizedError) && !(error instanceof BadRequestError) &&
      !(error instanceof NotFoundError) && !(error instanceof NotPendingError) &&
      !(error instanceof CallsOffError) && !(error instanceof CallForbiddenError)) {
      console.error(
        `[http] ${req.method} ${req.path} failed: ${error instanceof Error ? error.message : "unknown error"}`,
      );
    }
    sendError(res, error);
  }
}

/** The server has no zod dependency, so issues are flattened by hand. */
function issuesText(issues: { path: readonly unknown[]; message: string }[]): string {
  return issues
    .map(
      (issue) =>
        `${issue.path.map((segment) => String(segment)).join(".") || "<root>"}: ${issue.message}`,
    )
    .join("; ")
    .slice(0, 500);
}

function parseId(value: string): string {
  const parsed = RecordId.safeParse(value);
  if (!parsed.success) {
    throw new BadRequestError(`bad id: ${issuesText(parsed.error.issues)}`);
  }
  return parsed.data;
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

/** Lane prefixes served by the P6 router; only these pay its auth+limit middleware. */
const P6_PREFIXES = ["/bookings", "/notes", "/board", "/receipts"];

/** Which queries refetch after one change of this type is approved. */
function kindsForChange(type: ChangeType): RecordKind[] {
  if (type === "milestone_date") {
    return ["milestones", "proposed_changes"];
  }
  if (type === "commitment_update" || type === "commitment_create") {
    return ["commitments", "proposed_changes"];
  }
  return ["tasks", "proposed_changes"];
}

async function readSnapshot(repo: Repo, claims: AuthClaims): Promise<RecordsSnapshot> {
  const [accounts, projects, tasks, people] = await Promise.all([
    repo.accounts(claims),
    repo.projects(claims),
    repo.tasks(claims),
    repo.people(claims),
  ]);
  const [milestones, commitments] = await Promise.all([
    Promise.all(projects.map((project) => repo.milestones(claims, project.id))).then((lists) =>
      lists.flat()
    ),
    Promise.all(accounts.map((account) => repo.commitments(claims, account.id))).then((lists) =>
      lists.flat()
    ),
  ]);
  return { accounts, projects, milestones, tasks, commitments, people };
}

/** The meeting's room narrows extraction context through `ROOM_RECORDS`. */
function meetingContext(zoneId: string, snapshot: RecordsSnapshot): MeetingContext {
  const room = ROOM_RECORDS[zoneId];
  if (!room) {
    return { zoneId };
  }
  if (room.kind === "account") {
    return {
      zoneId,
      accountName: snapshot.accounts.find((account) => account.id === room.recordId)?.name,
    };
  }
  const project = snapshot.projects.find((item) => item.id === room.recordId);
  return {
    zoneId,
    projectName: project?.name,
    accountName: snapshot.accounts.find((account) => account.id === project?.accountId)?.name,
  };
}

/**
 * The HTTP routes (ARCHITECTURE.md section 5). Every endpoint except `/health`
 * needs `Authorization: Bearer <token>` (a Supabase JWT, or `dev:<name>`
 * locally); bodies and responses go through the shared Zod schemas, and the
 * workspace always comes from the verified token, never the client.
 */
export function httpRoutes(app: Application, deps: Deps, options: HttpRoutesOptions = {}): void {
  const limiter = options.limiter ?? new UserRateLimiter();

  app.get("/health", (_req, res) => {
    const health: Health = {
      ok: true,
      version: deps.version,
      authMode: deps.env.AUTH_MODE,
      llm: deps.env.LLM_API_KEY ? deps.env.LLM_PROVIDER : "fixture",
      calls: callsEnabled(deps.env) ? "on" : "off",
    };
    res.json(health);
  });

  const auth = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      (req as AuthedRequest).claims = await deps.auth.verify(bearer(req));
      next();
    } catch (error) {
      sendError(_res, error);
    }
  };

  const limit = (req: Request, res: Response, next: NextFunction): void => {
    const verdict = limiter.check(claimsOf(req).userId);
    if (!verdict.allowed) {
      res.setHeader("Retry-After", String(Math.max(1, Math.ceil(verdict.retryAfterMs / 1000))));
      res.status(429).json({ error: "rate_limited", message: "too many requests" });
      return;
    }
    next();
  };

  app.get("/me/day", auth, limit, (req, res) => {
    void handle(req, res, async () => {
      const claims = claimsOf(req);
      return MyDay.parse(await myDay(deps.repo, claims, claims.userId));
    });
  });

  app.get("/projects/:id/status", auth, limit, (req, res) => {
    void handle(req, res, async () =>
      ProjectStatus.parse(await projectStatus(deps.repo, claimsOf(req), parseId(req.params["id"] ?? "")))
    );
  });

  app.get("/accounts/:id/status", auth, limit, (req, res) => {
    void handle(req, res, async () =>
      AccountStatus.parse(await accountStatus(deps.repo, claimsOf(req), parseId(req.params["id"] ?? "")))
    );
  });

  app.post("/meetings", auth, limit, (req, res) => {
    void (async () => {
      try {
        const parsed = MeetingCreate.safeParse(req.body);
        if (!parsed.success) {
          throw new BadRequestError(`bad meeting: ${issuesText(parsed.error.issues)}`);
        }
        const body = parsed.data;
        const transcript = "fixture" in body ? FIXTURE_TRANSCRIPTS[body.fixture] : body.transcript;
        const claims = claimsOf(req);
        // P6-B: a booked meeting stores the booking's agenda with the meeting, and the
        // extraction sees it. No bookingId: exactly the unbooked path as before.
        let agenda: string | undefined;
        let bookingId: string | undefined;
        if (body.bookingId) {
          const booking = deps.bookings ? await deps.bookings.get(claims, body.bookingId) : null;
          if (!booking) {
            throw new BadRequestError(`unknown booking ${body.bookingId}`);
          }
          if (booking.zoneId !== body.zoneId) {
            throw new BadRequestError(`booking ${body.bookingId} is for another room`);
          }
          agenda = booking.agenda;
          bookingId = booking.id;
        }
        const snapshot = await readSnapshot(deps.repo, claims);
        const { extraction, changes } = await processMeeting({
          llm: deps.llm,
          transcript,
          context: meetingContext(body.zoneId, snapshot),
          snapshot,
          agenda,
        });
        const meeting = await deps.repo.createMeeting(claims, {
          zoneId: body.zoneId,
          transcript,
          summary: extraction.summary,
          decisions: extraction.decisions,
          agenda,
          bookingId,
        });
        const tagged: ProposedChange[] = changes.map((change) => ({
          ...change,
          sourceMeetingId: meeting.id,
        }));
        const result = MeetingProcessResult.parse({
          meetingId: meeting.id,
          proposedChanges: tagged,
        });
        await deps.repo.saveChanges(claims, result.proposedChanges);
        deps.bus.recordsChanged(claims.workspaceId, ["meetings", "proposed_changes"]);
        res.status(201).json(result);
      } catch (error) {
        sendError(res, error);
      }
    })();
  });

  app.get("/meetings/:id", auth, limit, (req, res) => {
    void handle(req, res, async () => {
      const meeting = await deps.repo.meeting(claimsOf(req), parseId(req.params["id"] ?? ""));
      if (!meeting) {
        throw new NotFoundError(`unknown meeting ${req.params["id"]}`);
      }
      return Meeting.parse(meeting);
    });
  });

  app.get("/proposed-changes", auth, limit, (req, res) => {
    void handle(req, res, async () => {
      const parsed = ProposedChangeQuery.safeParse({
        status: firstQuery(req.query["status"]),
        meetingId: firstQuery(req.query["meetingId"]),
      });
      if (!parsed.success) {
        throw new BadRequestError(`bad query: ${issuesText(parsed.error.issues)}`);
      }
      return ProposedChangeList.parse({
        changes: await deps.repo.changes(claimsOf(req), parsed.data),
      });
    });
  });

  app.post("/proposed-changes/:id/approve", auth, limit, (req, res) => {
    void handle(req, res, async () => {
      const claims = claimsOf(req);
      const id = parseId(req.params["id"] ?? "");
      const change = await deps.repo.change(claims, id);
      if (!change) {
        throw new NotFoundError(`unknown change ${id}`);
      }
      // The repo transaction runs first; only after it commits do live rooms
      // hear about it. A change that is no longer pending answers 409.
      await deps.repo.approveChange(claims, id);
      deps.bus.recordsChanged(claims.workspaceId, kindsForChange(change.type));
      return OkResult.parse({ ok: true });
    });
  });

  app.post("/proposed-changes/:id/reject", auth, limit, (req, res) => {
    void handle(req, res, async () => {
      const claims = claimsOf(req);
      const id = parseId(req.params["id"] ?? "");
      const change = await deps.repo.change(claims, id);
      if (!change) {
        throw new NotFoundError(`unknown change ${id}`);
      }
      await deps.repo.rejectChange(claims, id);
      deps.bus.recordsChanged(claims.workspaceId, ["proposed_changes"]);
      return OkResult.parse({ ok: true });
    });
  });

  app.post("/calls/token", auth, limit, (req, res) => {
    void handle(req, res, async () => {
      const parsed = CallTokenRequest.safeParse(req.body);
      if (!parsed.success) {
        throw new BadRequestError(`bad call token request: ${issuesText(parsed.error.issues)}`);
      }
      return issueCallToken({ env: deps.env, claims: claimsOf(req), zoneId: parsed.data.zoneId });
    });
  });

  // P6-0 slots (ARCHITECTURE.md 12.10): one authed router for the office-life features.
  // Each mount adds its routes here; the lanes own the feature files, these lines stay.
  // The router is mounted pathlessly, so its auth+limit middleware must only run for lane
  // prefixes: otherwise /ask (registered after) would pay auth+limit twice, and unmatched
  // paths would 401 instead of 404.
  const p6 = Router();
  p6.use((req, res, next) => {
    const path = req.path;
    const isLane = P6_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
    if (!isLane) {
      next();
      return;
    }
    void auth(req, res, () => limit(req, res, next));
  });
  if (deps.bookings) mountBookingRoutes(p6, deps);
  if (deps.notes) mountNoteRoutes(p6, deps);
  if (deps.board) mountBoardRoutes(p6, deps);
  if (deps.receipts) mountReceiptRoutes(p6, deps);
  app.use(p6);

  app.post("/ask", auth, limit, (req, res) => {
    void handle(req, res, async () => {
      const parsed = AskRequest.safeParse(req.body);
      if (!parsed.success) {
        throw new BadRequestError(`bad question: ${issuesText(parsed.error.issues)}`);
      }
      const claims = claimsOf(req);
      return AskResult.parse(
        await askQuestion({
          repo: deps.repo,
          claims,
          userId: claims.userId,
          question: parsed.data.question,
          llm: deps.llm,
        }),
      );
    });
  });
}
