// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { stopNet } from "../net/connection.js";
import { useNet } from "../net/store.js";
import { useMe } from "../office/me.js";
import AuthGate from "./AuthGate.js";
import { resetAuth, useAuth } from "./session.js";

interface FakeSession {
  access_token: string;
  user: { email: string };
}

interface FakeAuth {
  getSession: () => Promise<{ data: { session: FakeSession | null }; error: Error | null }>;
  signInWithPassword: (
    args: unknown,
  ) => Promise<{ data: { session: FakeSession | null }; error: Error | null }>;
  onAuthStateChange: (cb: unknown) => { data: { subscription: { unsubscribe(): void } } };
}

const { fakeAuth, createdWith } = vi.hoisted(() => ({
  fakeAuth: {
    getSession: async () => ({ data: { session: null }, error: null }),
    signInWithPassword: async () => ({
      data: { session: null },
      error: new Error("Invalid login credentials"),
    }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
  } as FakeAuth,
  createdWith: [] as { url: string; key: string }[],
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: (url: string, key: string) => {
    createdWith.push({ url, key });
    return { auth: fakeAuth };
  },
}));

const LOCAL_URL = "http://127.0.0.1:54321";

function supabaseEnv(url: string = LOCAL_URL): void {
  vi.stubEnv("VITE_AUTH_MODE", "supabase");
  vi.stubEnv("VITE_SUPABASE_URL", url);
  vi.stubEnv("VITE_SUPABASE_ANON_KEY", "test-anon-key");
}

function sessionFor(email: string, token = "jwt-token") {
  return { access_token: token, user: { email } };
}

beforeEach(() => {
  vi.stubEnv("VITE_AUTH_MODE", "");
  resetAuth();
  useMe.setState({ name: "Maya" });
  useNet.setState({ status: "offline", selfId: null, players: {}, npcs: {}, chat: [] });
  fakeAuth.getSession = async () => ({ data: { session: null }, error: null });
  fakeAuth.signInWithPassword = async () => ({
    data: { session: null },
    error: new Error("Invalid login credentials"),
  });
  createdWith.length = 0;
});

afterEach(() => {
  cleanup();
  stopNet();
  vi.unstubAllEnvs();
  resetAuth();
});

describe("AuthGate dev mode", () => {
  it("joins straight in and offers a name picker", async () => {
    render(
      <AuthGate>
        <p>office here</p>
      </AuthGate>,
    );
    expect(screen.getByText("office here")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Maya — switch" })).toBeTruthy();
  });

  it("rejoins with the picked name", async () => {
    render(
      <AuthGate>
        <p>office here</p>
      </AuthGate>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Maya — switch" }));
    fireEvent.click(screen.getByRole("button", { name: "Join as Arjun" }));
    await waitFor(() => expect(useMe.getState().name).toBe("Arjun"));
    expect(screen.getByRole("button", { name: "Arjun — switch" })).toBeTruthy();
  });

  it("accepts a custom name", async () => {
    render(
      <AuthGate>
        <p>office here</p>
      </AuthGate>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Maya — switch" }));
    fireEvent.change(screen.getByLabelText("Display name"), { target: { value: "Bob" } });
    fireEvent.click(screen.getByRole("button", { name: "Join" }));
    await waitFor(() => expect(useMe.getState().name).toBe("Bob"));
  });
});

describe("AuthGate supabase mode", () => {
  it("shows the Join-as buttons locally and signs in through Supabase Auth", async () => {
    supabaseEnv();
    const seen: unknown[] = [];
    fakeAuth.signInWithPassword = async (args: unknown) => {
      seen.push(args);
      return { data: { session: sessionFor("maya@northwind.local") }, error: null };
    };
    render(
      <AuthGate>
        <p>office here</p>
      </AuthGate>,
    );
    const join = await screen.findByRole("button", { name: "Join as Maya" });
    expect(screen.getByRole("button", { name: "Join as Arjun" })).toBeTruthy();
    fireEvent.click(join);
    await waitFor(() => expect(screen.getByText("office here")).toBeTruthy());
    expect(seen).toEqual([
      { email: "maya@northwind.local", password: "northwind-local-dev-only" },
    ]);
    expect(useMe.getState().name).toBe("Maya");
    expect(useAuth.getState().token).toBe("jwt-token");
    expect(createdWith).toEqual([{ url: LOCAL_URL, key: "test-anon-key" }]);
  });

  it("restores an existing session without clicks", async () => {
    supabaseEnv();
    fakeAuth.getSession = async () => ({
      data: { session: sessionFor("arjun@northwind.local", "restored") },
      error: null,
    });
    render(
      <AuthGate>
        <p>office here</p>
      </AuthGate>,
    );
    await waitFor(() => expect(screen.getByText("office here")).toBeTruthy());
    expect(useMe.getState().name).toBe("Arjun");
    expect(useAuth.getState().token).toBe("restored");
  });

  it("shows only the email form when deployed", async () => {
    supabaseEnv("https://xyzcompany.supabase.co");
    render(
      <AuthGate>
        <p>office here</p>
      </AuthGate>,
    );
    await waitFor(() => expect(screen.getByText("Sign in")).toBeTruthy());
    expect(screen.queryByRole("button", { name: "Join as Maya" })).toBeNull();
    const seen: unknown[] = [];
    fakeAuth.signInWithPassword = async (args: unknown) => {
      seen.push(args);
      return { data: { session: sessionFor("sam@acme.example") }, error: null };
    };
    fireEvent.change(screen.getByLabelText(/Email/), { target: { value: "sam@acme.example" } });
    fireEvent.change(screen.getByLabelText(/Password/), { target: { value: "s3cret" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(screen.getByText("office here")).toBeTruthy());
    expect(seen).toEqual([{ email: "sam@acme.example", password: "s3cret" }]);
  });

  it("shows the sign-in error and stays usable", async () => {
    supabaseEnv();
    render(
      <AuthGate>
        <p>office here</p>
      </AuthGate>,
    );
    const join = await screen.findByRole("button", { name: "Join as Maya" });
    fireEvent.click(join);
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(screen.getByRole("alert").textContent).toContain("Invalid login credentials");
    expect(screen.queryByText("office here")).toBeNull();
    expect(screen.getByRole("button", { name: "Join as Maya" })).toBeTruthy();
  });

  it("names the missing variables when env is absent", async () => {
    vi.stubEnv("VITE_AUTH_MODE", "supabase");
    vi.stubEnv("VITE_SUPABASE_URL", "");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "");
    render(
      <AuthGate>
        <p>office here</p>
      </AuthGate>,
    );
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(screen.getByRole("alert").textContent).toContain("VITE_SUPABASE_URL");
  });
});
