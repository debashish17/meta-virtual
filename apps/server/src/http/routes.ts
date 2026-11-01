import type { Application } from "express";
import type { Deps } from "../deps.js";

export interface Health {
  ok: true;
  version: string;
  authMode: string;
  llm: string;
}

/**
 * The HTTP routes (ARCHITECTURE.md section 5). Only `/health` here; P3-B adds the meetings,
 * changes and ask routes. It reports the deployed configuration and nothing secret, so a
 * rehearsal can confirm what is running.
 */
export function httpRoutes(app: Application, deps: Deps): void {
  app.get("/health", (_req, res) => {
    const health: Health = {
      ok: true,
      version: deps.version,
      authMode: deps.env.AUTH_MODE,
      llm: deps.env.LLM_API_KEY ? deps.env.LLM_PROVIDER : "fixture",
    };
    res.json(health);
  });
}
