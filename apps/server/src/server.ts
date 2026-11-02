import { Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import express from "express";
import type { Deps } from "./deps.js";
import { httpRoutes } from "./http/routes.js";
import { OfficeRoom } from "./room/office.room.js";

/**
 * Builds the one Node process that hosts the Colyseus room and the HTTP API
 * (ARCHITECTURE.md section 1). Used by `index.ts` and by tests; it builds but does not
 * listen, so tests choose their own port.
 */
export function createServer(deps: Deps): Server {
  const origins = deps.env.ALLOWED_ORIGINS.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  // Software-rendered clients on loaded boxes can stall past the default 3 s x 2
  // heartbeat and get terminated mid-session (P3-A evidence: 30+ min stable relaxed
  // vs churn strict). Relax only when explicitly asked (dev/e2e); production keeps
  // the strict defaults.
  const relaxedPing = deps.env.WS_PING_RELAXED === "1";
  const gameServer = new Server({
    transport: new WebSocketTransport(
      relaxedPing ? { pingInterval: 15_000, pingMaxRetries: 10 } : {},
    ),
    express: (app) => {
      app.use(express.json());
      app.use((req, res, next) => {
        const origin = req.header("Origin");
        res.header(
          "Access-Control-Allow-Origin",
          (origin && origins.includes(origin) ? origin : origins[0]) ?? "*",
        );
        res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
        next();
      });
      httpRoutes(app, deps);
    },
  });
  gameServer.define("office", OfficeRoom).filterBy(["workspaceId"]);
  return gameServer;
}
