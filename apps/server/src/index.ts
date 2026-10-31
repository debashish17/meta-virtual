import { Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { SHARED_HELLO } from "@office/shared";
import { OfficeRoom } from "./office.room.js";
import express from "express";

const PORT = Number(process.env.PORT ?? 2567);

console.log(`[server] shared constant: ${SHARED_HELLO}`);

const gameServer = new Server({
  transport: new WebSocketTransport(),
  express: (app) => {
    app.use(express.json());
    app.use((_req, res, next) => {
      res.header("Access-Control-Allow-Origin", "*");
      res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.header("Access-Control-Allow-Headers", "Content-Type");
      next();
    });

    app.get("/health", (_req, res) => {
      res.json({ ok: true, shared: SHARED_HELLO });
    });
  },
});

gameServer.define("office", OfficeRoom);

await gameServer.listen(PORT);
console.log(`[server] office room listening on :${PORT} (${SHARED_HELLO})`);
