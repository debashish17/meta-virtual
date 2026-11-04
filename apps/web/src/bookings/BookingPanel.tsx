import { useMemo, useState } from "react";
import {
  BOOKABLE_ZONES,
  DEMO_PEOPLE,
  ROOM_ENTRY,
  type Booking,
  type MeetingInvite,
} from "@office/shared";
import { bookingsApi, type BookingsApi } from "../api/bookings.js";
import { ApiError } from "../api/http.js";
import { useNet } from "../net/store.js";
import { walkTo } from "../office/Avatar.js";
import { useMe } from "../office/me.js";
import { useBookings, useBookingsStore } from "./store.js";
import "./bookings.css";

/**
 * "Book a room" (ARCHITECTURE.md 12.10, P6-B): the free rooms (busy ones greyed
 * with their title), a title, an agenda, invitees picked from the people in
 * the office. The host walks to the room on create; an invitee gets "Maya
 * invited you to <title> in <room>" with Join (walk there, `in_meeting`) and
 * Not now. Open bookings are listed for late joiners, with "End meeting" for
 * the host. Offline it books through the mock api.
 */

export interface BookingPanelDeps {
  api?: BookingsApi;
}

const roomName = (zoneId: string | null): string =>
  (zoneId && BOOKABLE_ZONES.find((zone) => zone.id === zoneId)?.name) ?? zoneId ?? "a call";

function joinRoom(zoneId: string | null): void {
  if (zoneId) {
    const entry = ROOM_ENTRY[zoneId];
    if (entry) {
      walkTo(entry);
    }
  }
  useNet.getState().send.status("in_meeting");
}

export default function BookingPanel({ deps }: { deps?: BookingPanelDeps }) {
  const api = deps?.api ?? bookingsApi;
  const { open, invites } = useBookings(api);
  const status = useNet((s) => s.status);
  const selfId = useNet((s) => s.selfId);
  const players = useNet((s) => s.players);
  const ownName = useMe((s) => s.name);

  const [expanded, setExpanded] = useState(false);
  const [zoneId, setZoneId] = useState("");
  const [title, setTitle] = useState("");
  const [agenda, setAgenda] = useState("");
  const [inviteeIds, setInviteeIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const online = status === "online" || status === "reconnecting";
  const candidates = useMemo(() => {
    if (online) {
      return Object.values(players)
        .filter((player) => player.id !== selfId)
        .map((player) => ({ id: player.userId, name: player.name }));
    }
    return DEMO_PEOPLE.filter((person) => person.name !== ownName).map((person) => ({
      id: person.key,
      name: person.name,
    }));
  }, [online, players, selfId, ownName]);

  const busyByZone = useMemo(() => {
    const busy = new Map<string, Booking>();
    for (const booking of open) {
      if (booking.zoneId) {
        busy.set(booking.zoneId, booking);
      }
    }
    return busy;
  }, [open]);

  const ownUserId = online ? (selfId ? players[selfId]?.userId : undefined) : ownName;
  const isHost = (booking: Booking): boolean =>
    ownUserId !== undefined && booking.hostId === ownUserId;

  const canBook =
    zoneId !== "" && title.trim() !== "" && inviteeIds.length > 0 && !busyByZone.has(zoneId);

  async function create(): Promise<void> {
    if (!canBook || pending) return;
    setPending(true);
    setError(null);
    try {
      const booking = await api.create({
        zoneId,
        title: title.trim(),
        agenda,
        inviteeIds,
      });
      if (booking.zoneId) {
        const entry = ROOM_ENTRY[booking.zoneId];
        if (entry) {
          walkTo(entry);
        }
      }
      setExpanded(false);
      setZoneId("");
      setTitle("");
      setAgenda("");
      setInviteeIds([]);
      await useBookingsStore.getState().load(api).catch(() => undefined);
    } catch (err) {
      if (err instanceof ApiError && err.code === "room_busy") {
        setError("That room was just booked — pick another.");
      } else {
        setError(err instanceof Error ? err.message : "could not book the room");
      }
      await useBookingsStore.getState().load(api).catch(() => undefined);
    } finally {
      setPending(false);
    }
  }

  async function endBooking(booking: Booking): Promise<void> {
    setError(null);
    try {
      await api.end(booking.id);
      await useBookingsStore.getState().load(api).catch(() => undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : "could not end the meeting");
    }
  }

  function joinInvite(invite: MeetingInvite): void {
    joinRoom(invite.zoneId);
    useBookingsStore.getState().dismissInvite(invite.bookingId);
  }

  function toggleInvitee(id: string): void {
    setInviteeIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  }

  return (
    <div className="pan-booking" data-testid="booking-panel">
      <button
        type="button"
        className="pan-btn"
        onClick={() => {
          setExpanded((was) => !was);
          setError(null);
        }}
      >
        Book a room
      </button>

      {invites.map((invite) => (
        <div className="pan-booking-invite" key={invite.bookingId} role="alert">
          <p>
            {invite.hostName} invited you to {invite.title} in {roomName(invite.zoneId)}
          </p>
          <div className="pan-booking-invite-actions">
            <button type="button" className="pan-btn pan-btn-primary" onClick={() => joinInvite(invite)}>
              Join
            </button>
            <button
              type="button"
              className="pan-btn"
              onClick={() => useBookingsStore.getState().dismissInvite(invite.bookingId)}
            >
              Not now
            </button>
          </div>
        </div>
      ))}

      {expanded && (
        <form
          className="pan-booking-form"
          aria-label="Book a room"
          onSubmit={(e) => {
            e.preventDefault();
            void create();
          }}
        >
          <label className="pan-booking-field">
            Room
            <select
              aria-label="Room"
              value={zoneId}
              onChange={(e) => setZoneId(e.target.value)}
            >
              <option value="">Pick a room…</option>
              {BOOKABLE_ZONES.map((zone) => {
                const busy = busyByZone.get(zone.id);
                return (
                  <option
                    key={zone.id}
                    value={zone.id}
                    disabled={busy !== undefined}
                    title={busy ? `Busy — ${busy.title}` : zone.name}
                  >
                    {busy ? `${zone.name} — busy (${busy.title})` : zone.name}
                  </option>
                );
              })}
            </select>
          </label>
          <label className="pan-booking-field">
            Title
            <input
              aria-label="Title"
              type="text"
              value={title}
              maxLength={120}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label className="pan-booking-field">
            Agenda
            <textarea
              aria-label="Agenda"
              value={agenda}
              maxLength={2000}
              rows={3}
              onChange={(e) => setAgenda(e.target.value)}
            />
          </label>
          <fieldset className="pan-booking-field">
            <legend>Invite</legend>
            {candidates.length === 0 && (
              <p className="pan-booking-hint">Nobody else is in the office yet.</p>
            )}
            {candidates.map((candidate) => (
              <label className="pan-booking-invitee" key={candidate.id}>
                <input
                  type="checkbox"
                  checked={inviteeIds.includes(candidate.id)}
                  onChange={() => toggleInvitee(candidate.id)}
                />
                {candidate.name}
              </label>
            ))}
          </fieldset>
          {error && (
            <p className="pan-error" role="alert">
              {error}
            </p>
          )}
          <div className="pan-booking-invite-actions">
            <button type="submit" className="pan-btn pan-btn-primary" disabled={!canBook || pending}>
              {pending ? "Booking…" : "Book"}
            </button>
            <button type="button" className="pan-btn" onClick={() => setExpanded(false)}>
              Cancel
            </button>
          </div>

          {open.length > 0 && (
            <div className="pan-booking-open">
              <h3>Open meetings</h3>
              <ul>
                {open.map((booking) => (
                  <li key={booking.id}>
                    <span>
                      {booking.title} · {roomName(booking.zoneId)}
                    </span>
                    <span className="pan-booking-invite-actions">
                      <button
                        type="button"
                        className="pan-btn"
                        onClick={() => joinRoom(booking.zoneId)}
                      >
                        Join
                      </button>
                      {isHost(booking) && (
                        <button
                          type="button"
                          className="pan-btn"
                          onClick={() => void endBooking(booking)}
                        >
                          End meeting
                        </button>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </form>
      )}
    </div>
  );
}
