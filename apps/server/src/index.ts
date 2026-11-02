import { buildDeps } from "./deps.js";
import { loadEnv } from "./env.js";
import { OfficeRoom } from "./room/office.room.js";
import { createServer } from "./server.js";

try {
  const env = loadEnv();
  const deps = buildDeps(env);
  OfficeRoom.verifier = deps.auth;
  OfficeRoom.chatPersist = deps.chat;
  const gameServer = createServer(deps);
  await gameServer.listen(env.PORT);
  console.log(`[server] office listening on :${env.PORT} (auth=${env.AUTH_MODE})`);
} catch (err) {
  // loadEnv names variables, never values, so this is safe to print.
  console.error(`[server] ${err instanceof Error ? err.message : err}`);
  process.exit(1);
}
