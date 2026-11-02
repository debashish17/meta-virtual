import { createHttpApi } from "./http.js";
import { createMockApi } from "./mock.js";
import type { OfficeApi } from "./types.js";

export type { OfficeApi } from "./types.js";

/**
 * The api the panels and wall displays use: the mock, unless `VITE_API=http` asks for the
 * server (P3-C adds that implementation).
 */
export function createOfficeApi(): OfficeApi {
  if (import.meta.env.VITE_API === "http") {
    return createHttpApi();
  }
  return createMockApi();
}

export const api: OfficeApi = createOfficeApi();
