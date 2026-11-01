import { useEffect, useState } from "react";
import { getLastError } from "../net/connection.js";
import { useNet } from "../net/store.js";

const MOCK_API = import.meta.env.VITE_API !== "http";

/**
 * Notices (top-centre, under the room pill): fixture/mock mode, connecting and
 * reconnecting, and the latest server error. Server errors live in the connection's
 * module state, so they are polled; the error pill dismisses per error number.
 */
export default function Notices({ loadError, onRetry }: { loadError: string | null; onRetry: () => void }) {
  const netStatus = useNet((s) => s.status);
  const [errorN, setErrorN] = useState(0);
  const [dismissed, setDismissed] = useState(0);
  useEffect(() => {
    const tick = () => {
      const last = getLastError();
      if (last) setErrorN((n) => Math.max(n, last.n));
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, []);
  const last = getLastError();
  const showError = last !== null && last.n === errorN && errorN > dismissed;

  return (
    <div className="pan-notices" aria-live="polite">
      {MOCK_API && (
        <p className="pan-pill" title="Records come from the in-memory mock API until P3-C wires the server.">
          Demo data
        </p>
      )}
      {netStatus === "connecting" && <p className="pan-pill">Connecting…</p>}
      {netStatus === "reconnecting" && <p className="pan-pill">Reconnecting…</p>}
      {showError && last && (
        <p className="pan-pill pan-pill-error" role="alert">
          {last.message}
          <button type="button" aria-label="Dismiss error" onClick={() => setDismissed(last.n)}>
            ×
          </button>
        </p>
      )}
      {loadError && (
        <p className="pan-pill pan-pill-error" role="alert">
          {loadError}
          <button type="button" onClick={onRetry}>
            Retry
          </button>
        </p>
      )}
    </div>
  );
}
