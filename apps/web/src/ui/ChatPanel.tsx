import { useEffect, useRef, useState } from "react";
import { ChatSend } from "@office/shared";
import { useNet } from "../net/store.js";

/** Chat (DESIGN_SPEC 9): bottom-left, collapsible, from the net store. */
export default function ChatPanel() {
  const [open, setOpen] = useState(true);
  const [draft, setDraft] = useState("");
  const chat = useNet((s) => s.chat);
  const send = useNet((s) => s.send);
  const netStatus = useNet((s) => s.status);
  const online = netStatus === "online";
  const list = useRef<HTMLUListElement>(null);
  useEffect(() => {
    const el = list.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat.length]);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const parsed = ChatSend.safeParse({ text: draft });
    if (!parsed.success || !online) return;
    send.chat(parsed.data.text);
    setDraft("");
  }

  if (!open) {
    return (
      <button type="button" className="pan-mini pan-mini-chat" aria-expanded="false" aria-label="Open chat" onClick={() => setOpen(true)}>
        Chat{chat.length > 0 ? ` (${chat.length})` : ""}
      </button>
    );
  }
  return (
    <section className="pan-chat" aria-label="Chat">
      <header className="pan-head">
        <h2>Chat</h2>
        <button type="button" className="pan-collapse" aria-label="Collapse panel" onClick={() => setOpen(false)}>
          ×
        </button>
      </header>
      <ul className="pan-list pan-chat-list" ref={list} aria-live="polite">
        {chat.map((m) => (
          <li key={m.id} className="pan-item">
            <p className="pan-item-title">
              {m.name} <time className="pan-time">{new Date(m.ts).toLocaleTimeString()}</time>
            </p>
            <p>{m.text}</p>
          </li>
        ))}
        {chat.length === 0 && <li className="pan-muted">{online ? "No messages yet." : "Join the server to chat."}</li>}
      </ul>
      <form className="pan-chat-form" onSubmit={submit}>
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={online ? "Message…" : "Offline"}
          aria-label="Chat message"
          maxLength={500}
          disabled={!online}
        />
        <button type="submit" className="pan-btn" disabled={!online || draft.trim().length === 0}>
          Send
        </button>
      </form>
    </section>
  );
}
