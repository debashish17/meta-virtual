import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { Note, NoteList } from "@office/shared";
import { afterEach, describe, expect, it } from "vitest";
import { buildDeps } from "../deps.js";
import { loadEnv } from "../env.js";
import { httpRoutes } from "../http/routes.js";
import { StubBus } from "../room/bus.js";

const MAYA = { Authorization: "Bearer dev:Maya" };
const ARJUN = { Authorization: "Bearer dev:Arjun" };

const BUY_MILK = { text: "Buy milk", color: "yellow" };

const servers: Server[] = [];
afterEach(async () => {
  while (servers.length > 0) {
    const server = servers.pop()!;
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

async function boot(): Promise<{ base: string; bus: StubBus }> {
  const bus = new StubBus();
  const app = express();
  app.use(express.json());
  httpRoutes(app, { ...buildDeps(loadEnv({})), bus });
  const server = app.listen(0, "127.0.0.1");
  servers.push(server);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const { port } = server.address() as AddressInfo;
  return { base: `http://127.0.0.1:${port}`, bus };
}

async function createNote(base: string, auth: Record<string, string>, body: unknown) {
  return fetch(`${base}/notes`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("notes routes", () => {
  it("needs a valid access token", async () => {
    const { base } = await boot();
    expect(await (await fetch(`${base}/notes`)).status).toBe(401);
  });

  it("creates, lists, edits, ticks and deletes, with no broadcast", async () => {
    const { base, bus } = await boot();
    const created = await createNote(base, MAYA, BUY_MILK);
    expect(created.status).toBe(201);
    const note = Note.parse(await created.json());
    expect(note).toMatchObject({ text: "Buy milk", color: "yellow", done: false });

    const list = NoteList.parse(await (await fetch(`${base}/notes`, { headers: MAYA })).json());
    expect(list.notes.map((item) => item.id)).toEqual([note.id]);

    const edited = await fetch(`${base}/notes/${note.id}`, {
      method: "PATCH",
      headers: { ...MAYA, "Content-Type": "application/json" },
      body: JSON.stringify({ text: "Buy oat milk", color: "green", done: true }),
    });
    expect(edited.status).toBe(200);
    expect(Note.parse(await edited.json())).toMatchObject({
      id: note.id,
      text: "Buy oat milk",
      color: "green",
      done: true,
    });

    const deleted = await fetch(`${base}/notes/${note.id}`, {
      method: "DELETE",
      headers: MAYA,
    });
    expect(deleted.status).toBe(200);
    const empty = NoteList.parse(
      await (await fetch(`${base}/notes`, { headers: MAYA })).json(),
    );
    expect(empty.notes).toHaveLength(0);

    expect(bus.calls).toHaveLength(0);
    expect(bus.invites).toHaveLength(0);
  });

  it("keeps Maya's notes from Arjun: no read, change or delete", async () => {
    const { base } = await boot();
    const note = Note.parse(await (await createNote(base, MAYA, BUY_MILK)).json());
    await createNote(base, ARJUN, { text: "Call Acme", color: "pink" });

    const arjuns = NoteList.parse(
      await (await fetch(`${base}/notes`, { headers: ARJUN })).json(),
    );
    expect(arjuns.notes.map((item) => item.id)).not.toContain(note.id);

    const patched = await fetch(`${base}/notes/${note.id}`, {
      method: "PATCH",
      headers: { ...ARJUN, "Content-Type": "application/json" },
      body: JSON.stringify({ done: true }),
    });
    expect(patched.status).toBe(404);

    const deleted = await fetch(`${base}/notes/${note.id}`, {
      method: "DELETE",
      headers: ARJUN,
    });
    expect(deleted.status).toBe(404);

    const mayas = NoteList.parse(
      await (await fetch(`${base}/notes`, { headers: MAYA })).json(),
    );
    expect(mayas.notes).toMatchObject([{ id: note.id, text: "Buy milk", done: false }]);
  });

  it("answers 400 for bodies outside the shared schemas", async () => {
    const { base } = await boot();
    expect((await createNote(base, MAYA, { color: "yellow" })).status).toBe(400);
    expect((await createNote(base, MAYA, { text: "  ", color: "yellow" })).status).toBe(400);
    expect(
      (await createNote(base, MAYA, { ...BUY_MILK, done: true })).status,
    ).toBe(400);
    expect((await createNote(base, MAYA, { ...BUY_MILK, extra: 1 })).status).toBe(400);

    const note = Note.parse(await (await createNote(base, MAYA, BUY_MILK)).json());
    const patch = (body: unknown) =>
      fetch(`${base}/notes/${note.id}`, {
        method: "PATCH",
        headers: { ...MAYA, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    expect((await patch({ text: "" })).status).toBe(400);
    expect((await patch({ done: "yes" })).status).toBe(400);
    expect((await patch({ userId: "dev-arjun" })).status).toBe(400);
  });

  it("answers 400 for a bad id and 404 for an unknown note", async () => {
    const { base } = await boot();
    const bad = await fetch(`${base}/notes/not-a-uuid`, {
      method: "PATCH",
      headers: { ...MAYA, "Content-Type": "application/json" },
      body: JSON.stringify({ done: true }),
    });
    expect(bad.status).toBe(400);
    const missing = "00000000-0000-4000-8000-000000000000";
    const patched = await fetch(`${base}/notes/${missing}`, {
      method: "PATCH",
      headers: { ...MAYA, "Content-Type": "application/json" },
      body: JSON.stringify({ done: true }),
    });
    expect(patched.status).toBe(404);
    const deleted = await fetch(`${base}/notes/${missing}`, {
      method: "DELETE",
      headers: MAYA,
    });
    expect(deleted.status).toBe(404);
  });
});
