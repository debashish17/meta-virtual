import { useState } from "react";
import { useNet } from "../net/store.js";
import { useMe } from "../office/me.js";

const STATUS_LABEL: Record<string, string> = { available: "Available", in_meeting: "In a meeting", away: "Away" };

/** Participants and presence (DESIGN_SPEC 9): top-left, collapsible, from the net store. */
export default function Participants() {
  const [open, setOpen] = useState(true);
  const netStatus = useNet((s) => s.status);
  const selfId = useNet((s) => s.selfId);
  const players = useNet((s) => s.players);
  const send = useNet((s) => s.send);
  const name = useMe((s) => s.name);
  const online = netStatus === "online";
  const others = Object.values(players)
    .filter((p) => p.id !== selfId)
    .sort((a, b) => a.name.localeCompare(b.name));
  const mine = (selfId ? players[selfId]?.status : undefined) ?? "available";

  if (!open) {
    return (
      <button type="button" className="pan-mini" aria-expanded="false" aria-label="Open participants" onClick={() => setOpen(true)}>
        People ({others.length + 1})
      </button>
    );
  }
  return (
    <section className="pan-participants" aria-label="Participants">
      <header className="pan-head">
        <h2>People</h2>
        <button type="button" className="pan-collapse" aria-label="Collapse panel" onClick={() => setOpen(false)}>
          ×
        </button>
      </header>
      <ul className="pan-list">
        <li className="pan-person">
          <span className="pan-dot on" aria-hidden="true" />
          <span>
            {name} (you)
            <span className="pan-sub">{STATUS_LABEL[mine]}</span>
          </span>
        </li>
        {others.map((p) => (
          <li key={p.id} className="pan-person">
            <span className="pan-dot on" aria-hidden="true" />
            <span>
              {p.name}
              <span className="pan-sub">{STATUS_LABEL[p.status] ?? p.status}</span>
            </span>
          </li>
        ))}
      </ul>
      <label className="pan-status">
        <span>Status</span>
        <select
          aria-label="Your status"
          value={mine}
          disabled={!online}
          onChange={(e) => send.status(e.target.value as "available" | "in_meeting" | "away")}
        >
          <option value="available">Available</option>
          <option value="in_meeting">In a meeting</option>
          <option value="away">Away</option>
        </select>
      </label>
      {!online && <p className="pan-muted">Single player — start the server for multiplayer.</p>}
    </section>
  );
}
