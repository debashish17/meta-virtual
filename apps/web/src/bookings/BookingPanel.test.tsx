// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ROOM_ENTRY } from "@office/shared";
import { createMockBookingsApi, type BookingsApi } from "../api/bookings.js";
import { useNet } from "../net/store.js";
import { walkTo } from "../office/Avatar.js";
import { useMe } from "../office/me.js";
import BookingPanel from "./BookingPanel.js";
import { useBookingsStore } from "./store.js";

vi.mock("../office/Avatar.js", () => ({ walkTo: vi.fn() }));

const mockedWalkTo = vi.mocked(walkTo);

afterEach(cleanup);

beforeEach(() => {
  vi.clearAllMocks();
  useNet.setState({ status: "offline", selfId: null, players: {}, npcs: {}, chat: [] });
  useMe.setState({ name: "Maya" });
  useBookingsStore.setState({ open: [], invites: [], dismissed: [] });
});

async function seed(api: BookingsApi, zoneId = "acme_room") {
  return api.create({ zoneId, title: "Acme sync", agenda: "Q3 review", inviteeIds: ["arjun"] });
}

describe("BookingPanel", () => {
  it("books a room with an invitee and walks there", async () => {
    const api = createMockBookingsApi();
    render(<BookingPanel deps={{ api }} />);
    fireEvent.click(screen.getByRole("button", { name: "Book a room" }));

    fireEvent.change(screen.getByLabelText("Room"), { target: { value: "acme_room" } });
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Acme sync" } });
    fireEvent.change(screen.getByLabelText("Agenda"), { target: { value: "Q3 review" } });
    fireEvent.click(screen.getByText("Arjun"));
    fireEvent.click(screen.getByRole("button", { name: "Book" }));

    await waitFor(() => expect(screen.queryByLabelText("Room")).toBeNull());
    expect(await api.listOpen()).toHaveLength(1);
    expect(mockedWalkTo).toHaveBeenCalledWith(ROOM_ENTRY["acme_room"]);
  });

  it("puts the host in the meeting too, like an invitee who joins", async () => {
    const status = vi.fn();
    useNet.setState({ send: { chat: () => undefined, status } });
    const api = createMockBookingsApi();
    render(<BookingPanel deps={{ api }} />);
    fireEvent.click(screen.getByRole("button", { name: "Book a room" }));
    fireEvent.change(screen.getByLabelText("Room"), { target: { value: "acme_room" } });
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Acme sync" } });
    fireEvent.click(screen.getByText("Arjun"));
    fireEvent.click(screen.getByRole("button", { name: "Book" }));

    await waitFor(() => expect(status).toHaveBeenCalledWith("in_meeting"));
    expect(mockedWalkTo).toHaveBeenCalledWith(ROOM_ENTRY["acme_room"]);
  });

  it("needs a room, a title and an invitee", () => {
    render(<BookingPanel deps={{ api: createMockBookingsApi() }} />);
    fireEvent.click(screen.getByRole("button", { name: "Book a room" }));
    const book = screen.getByRole("button", { name: "Book" }) as HTMLButtonElement;
    expect(book.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Room"), { target: { value: "acme_room" } });
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Acme sync" } });
    expect(book.disabled).toBe(true);
    fireEvent.click(screen.getByText("Arjun"));
    expect(book.disabled).toBe(false);
  });

  it("greys a busy room with its title", async () => {
    const api = createMockBookingsApi();
    await seed(api);
    render(<BookingPanel deps={{ api }} />);
    fireEvent.click(screen.getByRole("button", { name: "Book a room" }));
    await waitFor(() =>
      expect(screen.getByRole("option", { name: "Acme room — busy (Acme sync)" })).toBeTruthy(),
    );
    const option = screen.getByRole("option", {
      name: "Acme room — busy (Acme sync)",
    }) as HTMLOptionElement;
    expect(option.disabled).toBe(true);
  });

  it("lists open meetings with Join and End meeting for the host", async () => {
    const api = createMockBookingsApi();
    await seed(api);
    render(<BookingPanel deps={{ api }} />);
    fireEvent.click(screen.getByRole("button", { name: "Book a room" }));
    await waitFor(() => expect(screen.getByText("Open meetings")).toBeTruthy());
    expect(screen.getByText("Acme sync · Acme room")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Join" }));
    expect(mockedWalkTo).toHaveBeenCalledWith(ROOM_ENTRY["acme_room"]);

    fireEvent.click(screen.getByRole("button", { name: "End meeting" }));
    await waitFor(() => expect(screen.queryByText("Open meetings")).toBeNull());
    expect(await api.listOpen()).toHaveLength(0);
  });

  it("invites Join in and dismiss on Not now", async () => {
    const api = createMockBookingsApi();
    const booking = await seed(api);
    const status = vi.fn();
    useNet.setState({ send: { chat: () => undefined, status } });
    useBookingsStore.setState({ open: [booking] });
    useBookingsStore.getState().pushInvite({
      bookingId: booking.id,
      zoneId: "acme_room",
      title: "Acme sync",
      hostName: "Maya",
    });

    render(<BookingPanel deps={{ api }} />);
    expect(screen.getByText("Maya invited you to Acme sync in Acme room")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Join" }));
    expect(mockedWalkTo).toHaveBeenCalledWith(ROOM_ENTRY["acme_room"]);
    expect(status).toHaveBeenCalledWith("in_meeting");
    expect(screen.queryByText("Maya invited you to Acme sync in Acme room")).toBeNull();

    useBookingsStore.setState({ dismissed: [] });
    useBookingsStore.getState().pushInvite({
      bookingId: booking.id,
      zoneId: "acme_room",
      title: "Acme sync",
      hostName: "Maya",
    });
    expect(await screen.findByText("Maya invited you to Acme sync in Acme room")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Not now" }));
    expect(mockedWalkTo).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Maya invited you to Acme sync in Acme room")).toBeNull();
  });
});
