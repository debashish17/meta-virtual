import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { stopNet, startNet } from "../net/connection.js";
import { useRecords } from "../api/records.js";
import { useMe } from "../office/me.js";
import { OVERVIEW } from "../office/state.js";
import {
  SEED_USERS,
  authMode,
  isLocalSupabaseUrl,
  supabaseUrl,
  useAuth,
} from "./session.js";
import "./auth.css";

/**
 * The sign-in gate, wrapping the app in `App`.
 *
 * Dev mode (`VITE_AUTH_MODE` unset or `dev`) has no authentication to gate on — the server
 * trusts `dev:<name>` — so it joins with the stored name and offers a name picker that
 * rejoins with the new name. In a deployed build (`import.meta.env.PROD`) a first visit with
 * no name chosen yet (none stored, no `?name=`) asks "Who are you?" before the office loads,
 * so visitors do not all arrive as the 'Maya' fallback and share one identity. Development
 * builds (local dev, e2e, screenshots) keep joining straight in. Supabase mode blocks on a
 * sign-in screen instead: Join-as-Maya/Arjun buttons against a local Supabase, an email and
 * password form otherwise.
 */
export default function AuthGate({ children }: { children: ReactNode }) {
  if (authMode() !== "supabase") {
    return <DevGate>{children}</DevGate>;
  }
  return <SupabaseGate>{children}</SupabaseGate>;
}

function DevGate({ children }: { children: ReactNode }) {
  const [asking, setAsking] = useState(
    () => import.meta.env.PROD && !OVERVIEW && !useMe.getState().chosen,
  );
  if (asking) {
    return (
      <DevNameScreen
        onJoin={(name) => {
          useAuth.getState().signInDev(name);
          setAsking(false);
        }}
      />
    );
  }
  return (
    <>
      {children}
      <DevNamePicker />
    </>
  );
}

/** First visit to the deployed office: a name of your own, or one of the demo's two people. */
function DevNameScreen({ onJoin }: { onJoin: (name: string) => void }) {
  const [draft, setDraft] = useState("");
  const clean = draft.trim();
  return (
    <div className="auth-screen">
      <div className="auth-card" role="dialog" aria-label="Who are you?">
        <h1>Virtual Office</h1>
        <p>Who are you?</p>
        <form
          className="auth-form"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            if (clean) onJoin(clean);
          }}
        >
          <label>
            Your name
            <input
              value={draft}
              maxLength={40}
              autoComplete="name"
              autoFocus
              onChange={(e) => setDraft(e.target.value)}
            />
          </label>
          <button type="submit" disabled={!clean}>
            Join
          </button>
        </form>
        <div className="auth-seed">
          {SEED_USERS.map((user) => (
            <button key={user.key} type="button" onClick={() => onJoin(user.name)}>
              Join as {user.name}
            </button>
          ))}
          <p className="auth-hint">
            Maya and Arjun are the demo's two people: pick one to run the demo script. Everyone
            else, type your own name.
          </p>
        </div>
      </div>
    </div>
  );
}

function rejoinWith(name: string): void {
  useAuth.getState().signInDev(name);
  stopNet();
  startNet();
  void useRecords.getState().load().catch(() => undefined);
}

function DevNamePicker() {
  const name = useMe((s) => s.name);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(name);
  if (OVERVIEW) {
    return null;
  }
  if (!open) {
    return (
      <div className="auth-dev-chip">
        <button
          type="button"
          onClick={() => {
            setDraft(name);
            setOpen(true);
          }}
        >
          {name} — switch
        </button>
      </div>
    );
  }
  const join = (next: string) => {
    setOpen(false);
    rejoinWith(next);
  };
  return (
    <div className="auth-dev-chip" role="dialog" aria-label="Pick a name">
      <div className="auth-dev-pick">
        {SEED_USERS.map((user) => (
          <button key={user.key} type="button" onClick={() => join(user.name)}>
            Join as {user.name}
          </button>
        ))}
      </div>
      <form
        className="auth-dev-custom"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          join(draft);
        }}
      >
        <input
          aria-label="Display name"
          value={draft}
          maxLength={40}
          onChange={(e) => setDraft(e.target.value)}
        />
        <button type="submit">Join</button>
        <button type="button" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </form>
    </div>
  );
}

function SupabaseGate({ children }: { children: ReactNode }) {
  const status = useAuth((s) => s.status);
  const error = useAuth((s) => s.error);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    void useAuth.getState().restoreSession();
  }, []);

  if (status === "signed-in") {
    return <>{children}</>;
  }

  const url = supabaseUrl();
  const local = url !== null && isLocalSupabaseUrl(url);
  const busy = status === "signing-in";

  return (
    <div className="auth-screen">
      <div className="auth-card" role="dialog" aria-label="Sign in">
        <h1>Virtual Office</h1>
        {busy ? (
          <p>Signing in…</p>
        ) : (
          <>
            {local && (
              <div className="auth-seed">
                {SEED_USERS.map((user) => (
                  <button
                    key={user.key}
                    type="button"
                    onClick={() => void useAuth.getState().signInSeed(user.key)}
                  >
                    Join as {user.name}
                  </button>
                ))}
                <p className="auth-hint">Local demo users, signed in through Supabase Auth.</p>
              </div>
            )}
            <form
              className="auth-form"
              onSubmit={(e: FormEvent) => {
                e.preventDefault();
                void useAuth.getState().signInEmail(email, password);
              }}
            >
              <label>
                Email
                <input
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
              <label>
                Password
                <input
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
              <button type="submit">Sign in</button>
            </form>
            {error && (
              <p className="auth-error" role="alert">
                {error}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
