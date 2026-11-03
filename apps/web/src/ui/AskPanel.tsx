import { useState } from "react";
import { AskRequest, AskResult, type AskResult as AskResultData } from "@office/shared";
import { api } from "../api/index.js";

/**
 * Ask-the-office (DESIGN_SPEC 9): a single-line input at the bottom centre; the answer
 * renders above it so the panel expands upwards. Answers show their sources; an
 * abstention shows the no-record state. Reads through `api` (the mock until P3-C).
 * The close button collapses it to a small button, like the chat; reopening starts afresh.
 */
export default function AskPanel() {
  const [open, setOpen] = useState(true);
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<AskResultData | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function close() {
    setOpen(false);
    setResult(null);
    setError(null);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const parsed = AskRequest.safeParse({ question });
    if (!parsed.success || pending) return;
    setPending(true);
    setError(null);
    try {
      setResult(AskResult.parse(await api.ask(parsed.data.question)));
    } catch (err) {
      setResult(null);
      setError(err instanceof Error ? err.message : "asking failed");
    } finally {
      setPending(false);
    }
  }

  if (!open) {
    return (
      <button type="button" className="pan-mini pan-mini-ask" aria-expanded="false" onClick={() => setOpen(true)}>
        Ask the office
      </button>
    );
  }
  return (
    <section className="pan-ask" aria-label="Ask the office">
      {result && (
        <div className="pan-ask-result" role="status">
          <p>{result.answer}</p>
          {result.abstained ? (
            <p className="pan-muted">No record found — try the Acme integration status.</p>
          ) : (
            <ul className="pan-sources">
              {result.sources.map((s) => (
                <li key={`${s.type}:${s.id}`}>
                  <span className="pan-source-type">{s.type}</span> {s.label}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {error && (
        <p className="pan-error" role="alert">
          {error}
        </p>
      )}
      <form className="pan-ask-form" onSubmit={(e) => void submit(e)}>
        <input
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask the office…"
          aria-label="Your question"
          maxLength={500}
        />
        <button type="submit" className="pan-btn" disabled={pending || question.trim().length === 0}>
          {pending ? "Asking…" : "Ask"}
        </button>
        <button type="button" className="pan-collapse pan-ask-close" aria-label="Close" title="Close" onClick={close}>
          ×
        </button>
      </form>
    </section>
  );
}
