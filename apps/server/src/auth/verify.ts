import { DEMO_PEOPLE, WORKSPACE_ID, type AuthClaims } from "@office/shared";

export class UnauthorizedError extends Error {
  constructor(message = "unauthorized") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

/**
 * Verifies an access token (the SDK's `client.auth.token`, the HTTP Bearer token) into the
 * claims every handler and the room pass to the `Repo` (ARCHITECTURE.md 12.3). Both modes
 * resolve to the same `AuthClaims`; authorization never uses a client-supplied workspace.
 */
export interface AuthVerifier {
  verify(token: string | undefined): Promise<AuthClaims>;
}

/**
 * `AUTH_MODE=dev` (the local default): the web sends `dev:<name>` and this maps it to a user
 * of the demo workspace, matching the seeded people by name. Refuses to start in production.
 * P3-B adds the Supabase verifier.
 */
export class DevAuth implements AuthVerifier {
  constructor(nodeEnv: string | undefined = process.env.NODE_ENV) {
    if (nodeEnv === "production") {
      throw new Error("DevAuth is refused when NODE_ENV=production");
    }
  }

  async verify(token: string | undefined): Promise<AuthClaims> {
    const name = typeof token === "string" && token.startsWith("dev:") ? token.slice(4).trim() : "";
    if (!name) {
      throw new UnauthorizedError("expected a dev:<name> token");
    }
    const person = DEMO_PEOPLE.find((p) => p.name.toLowerCase() === name.toLowerCase());
    return {
      userId: `dev-${(person?.key ?? name.toLowerCase()).replace(/\s+/g, "-")}`,
      name: person?.name ?? name.slice(0, 40),
      workspaceId: WORKSPACE_ID,
    };
  }
}
