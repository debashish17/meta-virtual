import { test, expect } from "./helpers/twoUsers";
import {
  DEMO_VIEWPORT,
  freezeRender,
  serverBaseUrl,
  waitDrawerHeading,
  waitOnline,
  waitReady,
} from "./helpers/demo";

// P6-B: meetings in the rooms. Maya books the Acme room with Arjun and an agenda;
// Arjun gets the invite, joins and walks in; the room shows busy until it ends.
// A booked meeting processed with its bookingId stores the agenda with the meeting
// (needs the lead's POST /meetings wiring) and the drawer shows it above the summary.
//
// The e2e server is shared across specs in one run: each test ends the bookings it
// opens, and clears its own stale ones first, so an aborted run never wedges the
// next one with a 409.
test.setTimeout(900_000);

const TITLE = "Acme sync";
const AGENDA = "Review the go-live checklist";

async function load(page: import("@playwright/test").Page, name: string): Promise<void> {
  await page.setViewportSize(DEMO_VIEWPORT);
  await page.goto(`/?name=${name}&noao&noshadow`);
  await waitReady(page);
  await waitOnline(page);
}

interface BookingLite {
  id: string;
  zoneId: string | null;
  hostId: string;
}

/** End every open booking this host left behind (their own aborted runs). */
async function endStaleBookings(base: string, auth: Record<string, string>): Promise<void> {
  const open = (
    (await (await fetch(`${base}/bookings?status=open`, { headers: auth })).json()) as {
      bookings: BookingLite[];
    }
  ).bookings;
  for (const booking of open) {
    await fetch(`${base}/bookings/${booking.id}/end`, { method: "POST", headers: auth });
  }
}

async function pillContains(page: import("@playwright/test").Page, text: string): Promise<void> {
  await page.waitForFunction(
    (wanted: string) => document.querySelector(".office-pill")?.textContent?.includes(wanted) === true,
    text,
    { timeout: 300_000, polling: 1000 },
  );
}

test("a booking invites, joins and frees the room", async ({ alice: maya, bob: arjun }) => {
  await load(maya.page, "Maya");
  await load(arjun.page, "Arjun");

  const base = await serverBaseUrl(maya.page);
  const auth = { Authorization: "Bearer dev:Maya" };
  await endStaleBookings(base, auth);

  // Maya books the Acme room with Arjun and an agenda.
  await maya.page.getByRole("button", { name: "Book a room" }).click({ timeout: 120_000 });
  await maya.page.getByLabel("Room", { exact: true }).selectOption("acme_room", { timeout: 120_000 });
  await maya.page.getByLabel("Title", { exact: true }).fill(TITLE, { timeout: 120_000 });
  await maya.page.getByLabel("Agenda", { exact: true }).fill(AGENDA, { timeout: 120_000 });
  await maya.page.getByRole("checkbox", { name: "Arjun" }).check({ timeout: 120_000 });
  await maya.page.getByRole("button", { name: "Book", exact: true }).click({ timeout: 120_000 });

  // The host walks to the room on create.
  await pillContains(maya.page, "Acme room");

  // Arjun gets the invite and joins: he walks into the Acme room.
  const invite = arjun.page.locator(".pan-booking-invite", { hasText: "Maya invited you" });
  await expect(invite).toContainText(`${TITLE} in Acme room`, { timeout: 120_000 });
  await invite.getByRole("button", { name: "Join", exact: true }).click({ timeout: 120_000 });
  await pillContains(arjun.page, "Acme room");

  // The room shows busy to others while it is booked.
  await arjun.page.getByRole("button", { name: "Book a room" }).click({ timeout: 120_000 });
  const busy = arjun.page.getByRole("option", { name: `Acme room — busy (${TITLE})` });
  await expect(busy).toHaveJSProperty("disabled", true);

  // "End meeting" ends the booking and frees the room.
  await maya.page.getByRole("button", { name: "Book a room" }).click({ timeout: 120_000 });
  await maya.page.getByRole("button", { name: "End meeting" }).click({ timeout: 120_000 });
  const free = arjun.page.getByRole("option", { name: "Acme room", exact: true });
  await expect(free).toHaveJSProperty("disabled", false);
});

test("a booked meeting stores its agenda", async ({ alice: maya, bob: arjun }) => {
  await load(arjun.page, "Arjun");
  await freezeRender(arjun.page);
  await load(maya.page, "Maya");
  await freezeRender(maya.page);

  const base = await serverBaseUrl(maya.page);
  const auth = { Authorization: "Bearer dev:Maya" };
  const json = { ...auth, "Content-Type": "application/json" };
  await endStaleBookings(base, auth);

  // Decide every leftover pending change first, so the drawer shows this meeting.
  const pending = (
    (await (await fetch(`${base}/proposed-changes?status=pending`, { headers: auth })).json()) as {
      changes: { id: string }[];
    }
  ).changes;
  for (const change of pending) {
    await fetch(`${base}/proposed-changes/${change.id}/reject`, { method: "POST", headers: auth });
  }

  const booking = (await (
    await fetch(`${base}/bookings`, {
      method: "POST",
      headers: json,
      body: JSON.stringify({
        zoneId: "acme_room",
        title: TITLE,
        agenda: AGENDA,
        inviteeIds: ["dev-arjun"],
      }),
    })
  ).json()) as BookingLite;
  expect(typeof booking.id).toBe("string");

  const proc = (await (
    await fetch(`${base}/meetings`, {
      method: "POST",
      headers: json,
      body: JSON.stringify({ zoneId: "acme_room", fixture: "acme-sync", bookingId: booking.id }),
    })
  ).json()) as { meetingId: string; proposedChanges: unknown[] };
  expect(proc.proposedChanges).toHaveLength(4);

  const meeting = (await (
    await fetch(`${base}/meetings/${proc.meetingId}`, { headers: auth })
  ).json()) as { agenda?: string };
  expect(meeting.agenda).toBe(AGENDA);

  // The drawer shows the agenda above the summary, live.
  await waitDrawerHeading(maya.page, "maya", "Approvals (4)");
  await expect(maya.page.getByRole("heading", { name: "Agenda" })).toBeVisible({
    timeout: 120_000,
  });
  await expect(maya.page.locator(".pan-meeting-agenda")).toContainText(AGENDA, {
    timeout: 120_000,
  });

  await fetch(`${base}/bookings/${booking.id}/end`, { method: "POST", headers: auth });
});
