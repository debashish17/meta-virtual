import { describe } from "vitest";
import { officeApiContract } from "./contract.js";
import { createHttpApi } from "./http.js";

/**
 * The `OfficeApi` contract suite against the running local stack (P3-C task 5). Skipped
 * unless `E2E_STACK=1`; the server URL comes from `E2E_SERVER_URL` (a throwaway in-memory
 * server is enough: `PORT=2570 pnpm --filter @office/server dev`). Each case starts by
 * rejecting leftover pending changes, so the file is self-isolating on a shared server.
 */
const run = process.env.E2E_STACK === "1";

(run ? describe : describe.skip)("http OfficeApi contract (live stack)", () => {
  officeApiContract(async () => {
    const api = createHttpApi({
      baseUrl: process.env.E2E_SERVER_URL ?? "http://127.0.0.1:2567",
      getToken: async () => "dev:Maya",
    });
    for (const change of await api.listPending()) {
      await api.reject(change.id);
    }
    return api;
  });
});
