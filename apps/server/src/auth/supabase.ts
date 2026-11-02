import { createRemoteJWKSet, jwtVerify } from "jose";
import type { AuthClaims } from "@office/shared";
import { UnauthorizedError, type AuthVerifier } from "./verify.js";

/** What the membership lookup answers for one auth user. */
export interface WorkspaceMembership {
  workspaceId: string;
  name: string;
}

/**
 * Resolves an auth user id to their workspace and display name. P3-B implements
 * it in `deps.ts` over the `Repo` (service-side `memberships` + `profiles`
 * lookup); tests inject a stub.
 */
export type MembershipLookup = (userId: string) => Promise<WorkspaceMembership | null>;

/**
 * Membership cache TTL: a few seconds, so a revoked membership stops working
 * quickly while the common path stays a single JWKS-verified lookup.
 */
export const MEMBERSHIP_CACHE_TTL_MS = 5_000;

/**
 * Where to fetch the signing keys. `SUPABASE_JWKS_URL` wins; otherwise the
 * hosted shape under `SUPABASE_URL`. Fails closed naming the variable, never a value.
 */
export function resolveJwksUrl(env: {
  SUPABASE_JWKS_URL: string;
  SUPABASE_URL: string;
}): string {
  if (env.SUPABASE_JWKS_URL) {
    return env.SUPABASE_JWKS_URL;
  }
  if (env.SUPABASE_URL) {
    return `${env.SUPABASE_URL.replace(/\/+$/, "")}/auth/v1/.well-known/jwks.json`;
  }
  throw new Error("Invalid server env: SUPABASE_JWKS_URL (expected a URL; see .env.example)");
}

export interface SupabaseAuthOptions {
  jwksUrl: string;
  lookup: MembershipLookup;
  /** Seconds-scale cache for the membership lookup; `now` is a test seam. */
  cacheTtlMs?: number;
  now?: () => number;
}

/**
 * `AUTH_MODE=supabase`: verifies the access token with `jose` against the
 * JWKS endpoint (the local CLI signs ES256, verified by P1-B; hosted projects
 * use the same endpoint shape), then resolves the workspace and display name
 * through a membership lookup cached for a few seconds. Both modes resolve to
 * the same `AuthClaims`; authorization never uses a client-supplied workspace.
 */
export class SupabaseAuth implements AuthVerifier {
  private readonly jwks: ReturnType<typeof createRemoteJWKSet>;
  private readonly lookup: MembershipLookup;
  private readonly cacheTtlMs: number;
  private readonly now: () => number;
  private readonly cache = new Map<
    string,
    { membership: WorkspaceMembership; expiresAt: number }
  >();

  constructor(options: SupabaseAuthOptions) {
    this.jwks = createRemoteJWKSet(new URL(options.jwksUrl));
    this.lookup = options.lookup;
    this.cacheTtlMs = options.cacheTtlMs ?? MEMBERSHIP_CACHE_TTL_MS;
    this.now = options.now ?? Date.now;
  }

  async verify(token: string | undefined): Promise<AuthClaims> {
    if (!token) {
      throw new UnauthorizedError("missing bearer token");
    }
    let userId: string | undefined;
    try {
      const { payload } = await jwtVerify(token, this.jwks);
      userId = payload.sub;
    } catch {
      throw new UnauthorizedError("invalid token");
    }
    if (!userId) {
      throw new UnauthorizedError("invalid token");
    }
    const membership = await this.member(userId);
    if (!membership) {
      throw new UnauthorizedError("no workspace membership");
    }
    return { userId, name: membership.name, workspaceId: membership.workspaceId };
  }

  /** Positive-only cache: a fresh membership works on its first request. */
  private async member(userId: string): Promise<WorkspaceMembership | null> {
    const now = this.now();
    for (const [key, entry] of this.cache) {
      if (entry.expiresAt <= now) {
        this.cache.delete(key);
      }
    }
    const hit = this.cache.get(userId);
    if (hit) {
      return hit.membership;
    }
    const membership = await this.lookup(userId);
    if (membership) {
      this.cache.set(userId, { membership, expiresAt: now + this.cacheTtlMs });
    }
    return membership;
  }
}
