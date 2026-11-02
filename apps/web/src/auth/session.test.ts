import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useMe } from "../office/me.js";
import {
  SEED_USERS,
  authMode,
  getAuthToken,
  getSupabase,
  isLocalSupabaseUrl,
  resetAuth,
  useAuth,
} from "./session.js";

beforeEach(() => {
  resetAuth();
  useMe.setState({ name: "Maya" });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  resetAuth();
});

describe("auth session", () => {
  it("defaults to dev mode", () => {
    vi.stubEnv("VITE_AUTH_MODE", "");
    expect(authMode()).toBe("dev");
  });

  it("reads supabase mode from env", () => {
    vi.stubEnv("VITE_AUTH_MODE", "supabase");
    expect(authMode()).toBe("supabase");
  });

  it("treats only loopback Supabase URLs as local", () => {
    expect(isLocalSupabaseUrl("http://127.0.0.1:54321")).toBe(true);
    expect(isLocalSupabaseUrl("http://localhost:54321")).toBe(true);
    expect(isLocalSupabaseUrl("http://[::1]:54321")).toBe(true);
    expect(isLocalSupabaseUrl("https://xyzcompany.supabase.co")).toBe(false);
    expect(isLocalSupabaseUrl("not a url")).toBe(false);
  });

  it("names the seeded demo users", () => {
    expect(SEED_USERS).toEqual([
      { key: "maya", name: "Maya", email: "maya@northwind.local" },
      { key: "arjun", name: "Arjun", email: "arjun@northwind.local" },
    ]);
  });

  it("signs in dev mode with no network", () => {
    useAuth.getState().signInDev("  Arjun ");
    expect(useMe.getState().name).toBe("Arjun");
    expect(useAuth.getState().status).toBe("signed-in");
    expect(useAuth.getState().token).toBe("dev:Arjun");
  });

  it("falls back to Maya for a blank dev name", () => {
    useAuth.getState().signInDev("   ");
    expect(useMe.getState().name).toBe("Maya");
  });

  it("returns dev:<name> as the dev token", async () => {
    vi.stubEnv("VITE_AUTH_MODE", "");
    useMe.setState({ name: "Bob" });
    await expect(getAuthToken()).resolves.toBe("dev:Bob");
  });

  it("names the missing variables instead of throwing values", () => {
    vi.stubEnv("VITE_SUPABASE_URL", "");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "");
    expect(() => getSupabase()).toThrow(/VITE_SUPABASE_URL.*VITE_SUPABASE_ANON_KEY/);
  });
});
