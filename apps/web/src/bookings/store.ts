import { useEffect } from "react";
import { create } from "zustand";
import type { Booking, MeetingInvite } from "@office/shared";
import { bookingsApi, type BookingsApi } from "../api/bookings.js";
import { onRecordsChanged } from "../api/records.js";
import { onMeetingInvite } from "../net/connection.js";

/**
 * Bookings on the web (ARCHITECTURE.md 12.10, P6-B): the open bookings and the
 * invites read through `useBookings`. The list refetches live on
 * `records_changed bookings`, so the second user sees a booked room go busy
 * with no refresh. A failed load (the server restarting) keeps the last list
 * instead of blanking the panel.
 */

interface BookingsState {
  open: Booking[];
  invites: MeetingInvite[];
  dismissed: string[];
  load(api: BookingsApi): Promise<Booking[]>;
  pushInvite(invite: MeetingInvite): void;
  dismissInvite(bookingId: string): void;
}

export const useBookingsStore = create<BookingsState>()((set) => ({
  open: [],
  invites: [],
  dismissed: [],
  load: async (api) => {
    // The open list is the source of truth; invites are only ever dismissed by
    // hand. Filtering them against the list would drop real server invites when
    // the panel reads the mock api (local development default).
    const open = await api.listOpen();
    set({ open });
    return open;
  },
  pushInvite: (invite) => {
    if (invite.zoneId === null) return;
    set((state) =>
      state.dismissed.includes(invite.bookingId) ||
      state.invites.some((item) => item.bookingId === invite.bookingId)
        ? state
        : { invites: [...state.invites, invite] },
    );
  },
  dismissInvite: (bookingId) => {
    set((state) => ({
      invites: state.invites.filter((invite) => invite.bookingId !== bookingId),
      dismissed: state.dismissed.includes(bookingId)
        ? state.dismissed
        : [...state.dismissed, bookingId],
    }));
  },
}));

export function useBookings(api: BookingsApi = bookingsApi): {
  open: Booking[];
  invites: MeetingInvite[];
} {
  const open = useBookingsStore((state) => state.open);
  const invites = useBookingsStore((state) => state.invites);
  useEffect(() => {
    let live = true;
    const reload = (): void => {
      if (live) {
        void useBookingsStore.getState().load(api).catch(() => undefined);
      }
    };
    reload();
    const offChanged = onRecordsChanged("bookings", reload);
    const offInvite = onMeetingInvite((invite) => {
      if (live) {
        useBookingsStore.getState().pushInvite(invite);
      }
    });
    return () => {
      live = false;
      offChanged();
      offInvite();
    };
  }, [api]);
  return { open, invites };
}
