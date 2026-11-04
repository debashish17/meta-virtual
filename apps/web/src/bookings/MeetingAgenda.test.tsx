// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { api } from "../api/index.js";
import { useRecords } from "../api/records.js";
import MeetingAgenda from "./MeetingAgenda.js";

vi.mock("../api/index.js", () => ({ api: { meeting: vi.fn() } }));

const meeting = vi.mocked(api.meeting);

const MEETING_ID = "ac0e0099-0099-4009-8009-000000000099";

function stored(agenda?: string) {
  return {
    id: MEETING_ID,
    zoneId: "acme_room",
    startedAt: 1,
    transcript: "t",
    summary: "s",
    decisions: [],
    ...(agenda === undefined ? {} : { agenda }),
  };
}

afterEach(cleanup);

beforeEach(() => {
  vi.clearAllMocks();
  useRecords.setState({ meeting: null });
});

describe("MeetingAgenda", () => {
  it("shows the cached agenda above the summary", () => {
    useRecords.setState({ meeting: stored("Q3 review") });
    render(<MeetingAgenda meetingId={MEETING_ID} />);
    expect(screen.getByRole("heading", { name: "Agenda" })).toBeTruthy();
    expect(screen.getByText("Q3 review")).toBeTruthy();
    expect(meeting).not.toHaveBeenCalled();
  });

  it("fetches the agenda when the records have not loaded it", async () => {
    meeting.mockResolvedValue(stored("Q3 review"));
    render(<MeetingAgenda meetingId={MEETING_ID} />);
    await waitFor(() => expect(screen.getByText("Q3 review")).toBeTruthy());
    expect(meeting).toHaveBeenCalledWith(MEETING_ID);
  });

  it("renders nothing without an agenda", async () => {
    meeting.mockResolvedValue(stored());
    const { container } = render(<MeetingAgenda meetingId={MEETING_ID} />);
    await waitFor(() => expect(meeting).toHaveBeenCalled());
    expect(container.textContent).toBe("");
  });
});
