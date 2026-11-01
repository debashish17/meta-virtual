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
  const gameServer = new Server({
    transport: new WebSocketTransport(),
    express: (app) => {
      app.use(express.json());
      app.use((_req, res, next) => {
        res.header("Access-Control-Allow-Origin", origins[0] ?? "*");
        res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
        next();
      });
      httpRoutes(app, deps);
    },
  });
  gameServer.define("office", OfficeRoom);
  return gameServer;
}
