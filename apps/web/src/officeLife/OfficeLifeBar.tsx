import { useState } from "react";
import { DESK_SEATS, homeDeskSeatId, personKeyForDisplayName } from "@office/shared";
import { goToPlace, walkTo } from "../office/Avatar.js";
import { useMe } from "../office/me.js";
import { useNet } from "../net/store.js";
import "./officeLife.css";

/**
 * Check-in bar (P6-A, DESIGN_SPEC 9): top centre beside the zone pill, compact, never
 * over the centre of the floor. After joining, "Check in" (`go_to desk`); while working,
 * "Take a break" (`go_to break`); on a break, "Back to work" (`go_to desk`). Offline it
 * walks to the home desk through the local activity path; anything beyond Check in
 * offline is cut first (WORK_PACKAGES.md P6-A).
 */
export default function OfficeLifeBar() {
  const status = useNet((s) => s.status);
  const selfId = useNet((s) => s.selfId);
  const players = useNet((s) => s.players);
  const name = useMe((s) => s.name);
  const [checkedIn, setCheckedIn] = useState(false);
  const online = (status === "online" || status === "reconnecting") && selfId !== null;

  if (!online) {
    if (checkedIn) return null;
    const key = personKeyForDisplayName(name);
    const homeId = key ? homeDeskSeatId(key) : null;
    if (!homeId) return null;
    return (
      <div className="pan-officelife" data-testid="office-life-bar">
        <button
          type="button"
          className="pan-btn pan-btn-primary"
          onClick={() => {
            const seat = DESK_SEATS.find((s) => s.id === homeId);
            if (seat) walkTo({ x: seat.x, z: seat.z });
            setCheckedIn(true);
          }}
        >
          Check in
        </button>
      </div>
    );
  }

  const mine = (selfId ? players[selfId]?.status : undefined) ?? "available";
  const [label, action] =
    mine === "working"
      ? (["Working", "Take a break"] as const)
      : mine === "on_break"
        ? (["On a break", "Back to work"] as const)
        : (["Available", "Check in"] as const);
  return (
    <div className="pan-officelife" data-testid="office-life-bar">
      <span className="pan-officelife-status">{label}</span>
      <button
        type="button"
        className="pan-btn pan-btn-primary"
        onClick={() => goToPlace(action === "Take a break" ? "break" : "desk")}
      >
        {action}
      </button>
    </div>
  );
}
