import { create } from "zustand";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { useMe } from "../office/me.js";

/** Which sign-in AuthGate shows: the dev name picker, or Supabase Auth. */
export type AuthMode = "dev" | "supabase";

export function authMode(): AuthMode {
  return import.meta.env.VITE_AUTH_MODE === "supabase" ? "supabase" : "dev";
}

function envValue(name: string): string | null {
  const raw = (import.meta.env[name] as string | undefined)?.trim();
  return raw ? raw : null;
}

export function supabaseUrl(): string | null {
  return envValue("VITE_SUPABASE_URL");
}

export function supabaseAnonKey(): string | null {
  return envValue("VITE_SUPABASE_ANON_KEY");
}

/** Only a local Supabase (the CLI) gets the Join-as-Maya/Arjun buttons; anything else gets the email form. */
export function isLocalSupabaseUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^\[|\]$/g, "");
    return host === "localhost" || host === "127.0.0.1" || host === "::1";
  } catch {
    return false;
  }
}

export interface SeedUser {
  key: "maya" | "arjun";
  name: string;
  email: string;
}

export const SEED_USERS: SeedUser[] = [
  { key: "maya", name: "Maya", email: "maya@northwind.local" },
  { key: "arjun", name: "Arjun", email: "arjun@northwind.local" },
];

/**
 * The local-only test password for the Join-as buttons. It must match
 * `SEED_PASSWORD_FALLBACK` in `apps/server/src/db/seed.ts`, is documented there as
 * local-only, and is only ever sent to a local Supabase URL (see `signInSeed`).
 */
export const SEED_PASSWORD_LOCAL_ONLY = "northwind-local-dev-only";

let client: SupabaseClient | null = null;

/** The lazily created Supabase client; it throws naming the variable when env is missing. */
export function getSupabase(): SupabaseClient {
  if (!client) {
    const url = supabaseUrl();
    const key = supabaseAnonKey();
    if (!url || !key) {
      throw new Error("supabase sign-in needs VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY");
    }
    client = createClient(url, key);
    client.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        useAuth.setState({ status: "signed-out", token: null });
      } else if (session) {
        useAuth.setState({ status: "signed-in", token: session.access_token, error: null });
      }
    });
  }
  return client;
}

/** Drops the cached client (tests); the next `getSupabase` builds a fresh one. */
export function resetSupabaseClient(): void {
  client = null;
}

/** Resets the store and the client (tests). */
export function resetAuth(): void {
  resetSupabaseClient();
  useAuth.setState({ status: "signed-out", token: null, error: null });
}

export type AuthStatus = "signed-out" | "signing-in" | "signed-in" | "error";

interface AuthState {
  status: AuthStatus;
  /** The last known access token; `getAuthToken` reads the live session instead. */
  token: string | null;
  error: string | null;
  restoreSession(): Promise<void>;
  signInDev(name: string): void;
  signInSeed(key: SeedUser["key"]): Promise<void>;
  signInEmail(email: string, password: string): Promise<void>;
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : "sign-in failed";
}

function displayNameForEmail(email: string): string {
  const seed = SEED_USERS.find((user) => user.email.toLowerCase() === email.toLowerCase());
  if (seed) {
    return seed.name;
  }
  return email.split("@")[0]?.trim() || "Player";
}

export const useAuth = create<AuthState>()((set) => ({
  status: "signed-out",
  token: null,
  error: null,

  restoreSession: async () => {
    set({ status: "signing-in", error: null });
    try {
      const { data, error } = await getSupabase().auth.getSession();
      if (error) {
        throw error;
      }
      if (!data.session) {
        set({ status: "signed-out", token: null });
        return;
      }
      useMe.getState().setName(displayNameForEmail(data.session.user.email ?? ""));
      set({ status: "signed-in", token: data.session.access_token, error: null });
    } catch (err) {
      set({ status: "error", token: null, error: messageOf(err) });
    }
  },

  signInDev: (name) => {
    const clean = name.trim() || "Maya";
    useMe.getState().setName(clean);
    set({ status: "signed-in", token: `dev:${clean}`, error: null });
  },

  signInSeed: async (key) => {
    const user = SEED_USERS.find((entry) => entry.key === key);
    set({ status: "signing-in", error: null });
    try {
      const url = supabaseUrl();
      if (!user || !url || !isLocalSupabaseUrl(url)) {
        throw new Error("the seeded sign-in is only for local Supabase");
      }
      const { data, error } = await getSupabase().auth.signInWithPassword({
        email: user.email,
        password: SEED_PASSWORD_LOCAL_ONLY,
      });
      if (error) {
        throw error;
      }
      if (!data.session) {
        throw new Error("sign-in returned no session");
      }
      useMe.getState().setName(user.name);
      set({ status: "signed-in", token: data.session.access_token, error: null });
    } catch (err) {
      set({ status: "error", token: null, error: messageOf(err) });
    }
  },

  signInEmail: async (email, password) => {
    set({ status: "signing-in", error: null });
    try {
      const { data, error } = await getSupabase().auth.signInWithPassword({ email, password });
      if (error) {
        throw error;
      }
      if (!data.session) {
        throw new Error("sign-in returned no session");
      }
      useMe.getState().setName(displayNameForEmail(email));
      set({ status: "signed-in", token: data.session.access_token, error: null });
    } catch (err) {
      set({ status: "error", token: null, error: messageOf(err) });
    }
  },
}));

/**
 * The token for the HTTP Bearer [REDACTED] the room's `client.auth.token`: `dev:<name>` in
 * dev mode, the live Supabase session otherwise, so a refreshed token is used on the next
 * (re)connect. Null only when supabase mode has no session.
 */
export async function getAuthToken(): Promise<string | null> {
  if (authMode() === "dev") {
    return `dev:${useMe.getState().name.trim() || "Maya"}`;
  }
  try {
    const { data } = await getSupabase().auth.getSession();
    return data.session?.access_token ?? useAuth.getState().token;
  } catch {
    return useAuth.getState().token;
  }
}
